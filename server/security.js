/**
 * 3D Manager Pro — Módulo Central de Segurança da API
 * Inclui:
 * - Rate Limiting em memória (proteção contra força bruta, enumeração e abuso)
 * - Guardião contra SQL Injection, NoSQL Operator Injection e Prototype Pollution
 * - Criptografia autenticada AES-256-GCM para segredos em repouso (ex: Access Codes de impressoras)
 * - Sanitização de dados públicos (rastreio) e escape HTML contra XSS
 * - Cabeçalhos HTTP de segurança
 */

const crypto = require('crypto');

// =========================================================
// 1. EXTRAÇÃO DE IP & CABEÇALHOS DE SEGURANÇA
// =========================================================

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
}

// =========================================================
// 2. RATE LIMITING (CONTROLE DE TAXA DE REQUISIÇÕES)
// =========================================================

function createRateLimiter(options = {}) {
    const {
        windowMs = 60 * 1000,
        max = 100,
        keyPrefix = 'rl',
        message = 'Muitas requisições deste endereço IP. Aguarde um instante e tente novamente.',
        htmlResponse = false
    } = options;

    const hits = new Map(); // key -> { count, resetAt }

    // Limpeza periódica de chaves expiradas para evitar vazamento de memória
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits.entries()) {
            if (now >= entry.resetAt) {
                hits.delete(key);
            }
        }
    }, Math.max(30 * 1000, windowMs));

    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }

    const middleware = (req, res, next) => {
        // Ignora preflight OPTIONS para não interferir no CORS
        if (req.method === 'OPTIONS') return next();

        const ip = getClientIp(req);
        const key = `${keyPrefix}:${ip}`;
        const now = Date.now();

        let entry = hits.get(key);
        if (!entry || now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count += 1;

        const remaining = Math.max(0, max - entry.count);
        const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > max) {
            res.setHeader('Retry-After', String(retryAfterSec));
            console.warn(`[SECURITY][RATE-LIMIT] Limite excedido (${keyPrefix}) para IP ${ip} em ${req.method} ${req.originalUrl}`);
            if (htmlResponse) {
                return res.status(429).send(
                    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>429 - Muitas tentativas</title></head>' +
                    '<body style="font-family:sans-serif;background:#080a10;color:#f8fafc;padding:40px;text-align:center;">' +
                    '<h1>⏳ Muitas consultas seguidas</h1>' +
                    `<p>${escapeHtml(message)} (Tente novamente em ${retryAfterSec}s)</p></body></html>`
                );
            }
            return res.status(429).json({
                ok: false,
                erro: message,
                retryAfter: retryAfterSec
            });
        }

        next();
    };

    // Utilitário interno para testes/reset
    middleware._reset = () => hits.clear();
    return middleware;
}

// Limitadores pré-configurados por criticidade
const authLimiter = createRateLimiter({
    keyPrefix: 'auth',
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15,                  // máx 15 tentativas por IP a cada 15 min
    message: 'Muitas tentativas de autenticação. Por segurança, aguarde alguns minutos antes de tentar novamente.'
});

const trackingLimiter = createRateLimiter({
    keyPrefix: 'tracking',
    windowMs: 60 * 1000,      // 1 minuto
    max: 30,                  // máx 30 consultas/min por IP
    message: 'Limite de consultas de rastreio atingido. Aguarde um minuto.'
});

const trackingHtmlLimiter = createRateLimiter({
    keyPrefix: 'tracking_html',
    windowMs: 60 * 1000,
    max: 30,
    message: 'Limite de consultas de rastreio atingido.',
    htmlResponse: true
});

const externalApiLimiter = createRateLimiter({
    keyPrefix: 'ext_api',
    windowMs: 60 * 1000,      // 1 minuto
    max: 20,                  // máx 20 chamadas/min (IA, URL Resolver, Bambu Cloud Login)
    message: 'Limite de requisições para serviços externos atingido. Aguarde um instante.'
});

const globalApiLimiter = createRateLimiter({
    keyPrefix: 'global_api',
    windowMs: 60 * 1000,      // 1 minuto
    max: 300,                 // permite polling normal do app (~20-40 req/min) bloqueando floods
    message: 'Limite global de requisições excedido. Tente novamente em instantes.'
});

// =========================================================
// 3. DETECÇÃO E BLOQUEIO DE SQL INJECTION & NOSQL INJECTION
// =========================================================

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Campos que contêm payloads codificados legítimos (imagens base64 ou JWTs longos)
const SKIP_SQL_SCAN_FIELDS = new Set(['foto', 'token', 'bambuToken']);

const JWT_LIKE_REGEX = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

// Assinaturas clássicas e avançadas de SQL Injection (sem falsos positivos em textos comerciais comuns)
const SQL_INJECTION_PATTERNS = [
    // UNION [ALL] SELECT ...
    { nome: 'UNION_SELECT', regex: /\bUNION\b[\s/*]+(?:\bALL\b[\s/*]+)?\bSELECT\b/i },
    // Tautologias booleanas com quebra de aspas: ' OR '1'='1, " OR 1=1 --, ') OR ('a'='a
    { nome: 'BOOLEAN_TAUTOLOGY', regex: /['"`)\s]+(?:OR|AND)\s+['"`(]*(\w+)['"`)]*\s*=\s*['"`(]*\1\b/i },
    { nome: 'AUTH_BYPASS_OR', regex: /['"`]\s*(?:OR|AND)\s+(?:TRUE\b|\d+\s*=\s*\d+|['"`][^'"`]*['"`]\s*=\s*['"`][^'"`]*['"`])/i },
    // Stacked queries destrutivas ou administrativas (; DROP TABLE, ; DELETE FROM, ; EXEC ...)
    { nome: 'STACKED_QUERY', regex: /;[\s/*]*(?:DROP|ALTER|TRUNCATE|EXEC(?:UTE)?|DECLARE|GRANT|REVOKE)\s+\w+/i },
    { nome: 'DDL_DML_INJECTION', regex: /(?:;|\bUNION\b|['"`])\s*(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|DATABASE|USER))\b/i },
    // Blind SQL Injection baseado em tempo (SLEEP, BENCHMARK, PG_SLEEP, WAITFOR DELAY)
    { nome: 'TIME_BASED_SQLI', regex: /\b(?:SLEEP|BENCHMARK|PG_SLEEP)\s*\(\s*\d+|\bWAITFOR\s+DELAY\s+['"`]/i },
    // Introspecção de catálogo / leitura de arquivos / execução de comandos
    { nome: 'SYSTEM_CATALOG_PROBE', regex: /\b(?:INFORMATION_SCHEMA|SYSOBJECTS|SYSCOLUMNS|XP_CMDSHELL|LOAD_FILE\s*\(|INTO\s+(?:OUTFILE|DUMPFILE))\b/i },
    // Quebra de string seguida imediatamente por comentário SQL ('--, '#, '/*)
    { nome: 'QUOTE_COMMENT_BYPASS', regex: /['"`]\s*(?:--(?:\s|$)|\/\*[\s\S]*?\*\/|#(?:\s|$))/ }
];

function detectSqlInjection(value, fieldName = '') {
    if (typeof value !== 'string' || value.length < 3) return null;
    if (SKIP_SQL_SCAN_FIELDS.has(fieldName)) {
        if (value.startsWith('data:image/') || JWT_LIKE_REGEX.test(value)) {
            return null;
        }
    }
    if (value.startsWith('data:image/') || value.startsWith('enc:v1:')) {
        return null;
    }

    for (const rule of SQL_INJECTION_PATTERNS) {
        if (rule.regex.test(value)) {
            return rule.nome;
        }
    }
    return null;
}

/**
 * Inspeciona recursivamente objetos/arrays/strings buscando:
 * 1. Operadores NoSQL do MongoDB (chaves iniciadas por '$', ou '.' em query)
 * 2. Prototype Pollution (__proto__, constructor, prototype)
 * 3. Payloads de SQL Injection em valores de texto
 */
function inspectPayloadForInjection(input, options = {}) {
    const {
        path = 'root',
        fieldName = '',
        forbidDotKeys = false,
        depth = 0,
        maxDepth = 20
    } = options;

    if (depth > maxDepth) {
        return { bloqueado: true, tipo: 'MAX_DEPTH_EXCEEDED', campo: path };
    }

    if (input === null || input === undefined) return null;

    if (typeof input === 'string') {
        const sqlRule = detectSqlInjection(input, fieldName);
        if (sqlRule) {
            return { bloqueado: true, tipo: `SQL_INJECTION:${sqlRule}`, campo: path };
        }
        return null;
    }

    if (Array.isArray(input)) {
        for (let i = 0; i < input.length; i++) {
            const res = inspectPayloadForInjection(input[i], {
                path: `${path}[${i}]`,
                fieldName,
                forbidDotKeys,
                depth: depth + 1,
                maxDepth
            });
            if (res) return res;
        }
        return null;
    }

    if (typeof input === 'object') {
        const keys = Object.keys(input);
        for (const key of keys) {
            if (DANGEROUS_OBJECT_KEYS.has(key)) {
                return { bloqueado: true, tipo: 'PROTOTYPE_POLLUTION', campo: `${path}.${key}` };
            }
            if (key.startsWith('$')) {
                return { bloqueado: true, tipo: 'NOSQL_OPERATOR_INJECTION', campo: `${path}.${key}` };
            }
            if (forbidDotKeys && key.includes('.')) {
                return { bloqueado: true, tipo: 'NOSQL_DOT_PATH_INJECTION', campo: `${path}.${key}` };
            }

            // Também verifica se a própria chave contém tentativa de SQLi
            const keySql = detectSqlInjection(key, '');
            if (keySql) {
                return { bloqueado: true, tipo: `SQL_INJECTION_KEY:${keySql}`, campo: `${path}.${key}` };
            }

            const res = inspectPayloadForInjection(input[key], {
                path: `${path}.${key}`,
                fieldName: key,
                forbidDotKeys,
                depth: depth + 1,
                maxDepth
            });
            if (res) return res;
        }
    }

    return null;
}

function injectionGuard(req, res, next) {
    let decodedPath = req.path || '';
    try {
        decodedPath = decodeURIComponent(req.path || '');
    } catch {
        return res.status(400).json({
            ok: false,
            erro: 'Requisição bloqueada: URL malformada.'
        });
    }

    const checkTargets = [
        { data: decodedPath, path: 'url.path', forbidDotKeys: false },
        { data: req.params, path: 'params', forbidDotKeys: true },
        { data: req.query, path: 'query', forbidDotKeys: true },
        { data: req.body, path: 'body', forbidDotKeys: false }
    ];

    for (const target of checkTargets) {
        if (!target.data) continue;
        const deteccao = inspectPayloadForInjection(target.data, {
            path: target.path,
            forbidDotKeys: target.forbidDotKeys
        });
        if (deteccao && deteccao.bloqueado) {
            const ip = getClientIp(req);
            console.warn(
                `[SECURITY][INJECTION-BLOCKED] Tipo=${deteccao.tipo} Campo=${deteccao.campo} IP=${ip} Rota=${req.method} ${req.originalUrl}`
            );
            if (!req.path.startsWith('/api/')) {
                return res.status(400).send('<h1>400 - Requisição bloqueada por segurança</h1>');
            }
            return res.status(400).json({
                ok: false,
                erro: 'Requisição bloqueada por segurança: parâmetros ou caracteres inválidos detectados.'
            });
        }
    }

    next();
}

/**
 * Remove campos imutáveis/privilegiados de payloads de criação/edição em coleções multi-tenant
 */
function sanitizeCollectionBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    const clean = { ...body };
    delete clean._id;
    delete clean.id;
    delete clean.tenantId;
    delete clean.__v;
    delete clean.role;
    delete clean.senhaHash;
    return clean;
}

// =========================================================
// 4. CRIPTOGRAFIA SIMÉTRICA AES-256-GCM (SEGREDOS EM REPOUSO)
// =========================================================

const ENC_PREFIX = 'enc:v1:';
let cachedMasterKey = null;

function getEncryptionKey() {
    if (cachedMasterKey) return cachedMasterKey;
    const rawSecret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!rawSecret) {
        throw new Error('ENCRYPTION_KEY ou JWT_SECRET deve estar configurado em .env para criptografia de dados.');
    }
    cachedMasterKey = crypto.scryptSync(String(rawSecret), '3d-manager-aes256-salt-v1', 32);
    return cachedMasterKey;
}

function encryptSecret(plainText) {
    if (plainText === undefined || plainText === null) return '';
    const str = String(plainText);
    if (!str) return '';
    if (str.startsWith(ENC_PREFIX)) return str; // já criptografado

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96 bits recomendado para GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(storedValue) {
    if (storedValue === undefined || storedValue === null) return '';
    const str = String(storedValue);
    if (!str) return '';
    if (!str.startsWith(ENC_PREFIX)) {
        // Compatibilidade retroativa com registros antigos salvos antes da criptografia
        return str;
    }

    try {
        const parts = str.slice(ENC_PREFIX.length).split(':');
        if (parts.length !== 3) return '';
        const [ivHex, tagHex, cipherHex] = parts;
        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(cipherHex, 'hex')),
            decipher.final()
        ]);
        return decrypted.toString('utf8');
    } catch (err) {
        console.warn('[SECURITY] Falha ao descriptografar segredo armazenado:', err.message);
        return '';
    }
}

// =========================================================
// 5. ESCAPE HTML (ANTI-XSS) & SANITIZAÇÃO DE RASTREIO PÚBLICO
// =========================================================

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Remove dados financeiros/confidenciais (lucro, custo, bruto, taxas, detalheCustos, precoKg, tenantId)
 * antes de retornar dados na API pública de rastreio (/api/rastreio/:pedidoId)
 */
function sanitizePublicTracking(venda, filaItem) {
    const sanitizeFilamentos = (lista) => {
        if (!Array.isArray(lista)) return [];
        return lista.map(f => ({
            nome: f?.nome || 'Filamento 3D',
            peso: typeof f?.peso === 'number' ? f.peso : undefined
        }));
    };

    const vendaPublica = venda ? {
        pedidoId: venda.pedidoId || String(venda._id),
        nome: venda.nome || 'Pedido 3D',
        quantidade: venda.quantidade || 1,
        status: venda.status || 'pre_venda',
        codigoRastreio: venda.sku || '',
        data: venda.data || null,
        filamentosUsados: sanitizeFilamentos(venda.filamentosUsados)
    } : null;

    const filaPublica = filaItem ? {
        nomeItem: filaItem.nomeItem || '',
        impressoraNome: filaItem.impressoraNome || 'Impressora 3D',
        quantidade: filaItem.quantidade || 1,
        status: filaItem.status || 'pendente',
        tempoEstimadoHoras: filaItem.tempoEstimadoHoras || 0,
        iniciadoEm: filaItem.iniciadoEm || null,
        concluidoEm: filaItem.concluidoEm || null,
        observacoes: filaItem.observacoes || '',
        filamentosUsados: sanitizeFilamentos(filaItem.filamentosUsados)
    } : null;

    return { venda: vendaPublica, fila: filaPublica };
}

module.exports = {
    getClientIp,
    securityHeaders,
    createRateLimiter,
    authLimiter,
    trackingLimiter,
    trackingHtmlLimiter,
    externalApiLimiter,
    globalApiLimiter,
    detectSqlInjection,
    inspectPayloadForInjection,
    injectionGuard,
    sanitizeCollectionBody,
    encryptSecret,
    decryptSecret,
    escapeHtml,
    sanitizePublicTracking
};
