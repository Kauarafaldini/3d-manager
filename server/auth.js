const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
const JWT_EXPIRES_LONG = '30d';

if (!JWT_SECRET) {
    console.error('[SECURITY][FATAL] Variável JWT_SECRET não definida em server/.env!');
} else if (JWT_SECRET === 'altere-isso-em-producao' || JWT_SECRET === 'altere-isso-em-producao-3dmanager' || JWT_SECRET.length < 16) {
    console.warn('[SECURITY][AVISO] JWT_SECRET atual é fraco ou padrão de exemplo. Recomenda-se usar uma chave aleatória longa (>= 32 caracteres).');
}

// Cache curto (30s) de status ativo do usuário para bloquear contas desativadas em todas as rotas sem sobrecarregar o banco
const USER_STATUS_TTL_MS = 30 * 1000;
const userStatusCache = new Map(); // userId -> { ativo, role, tenantId, expiresAt }

function invalidateUserCache(userId) {
    if (!userId) return;
    userStatusCache.delete(String(userId));
}

function getSecretOrThrow() {
    const secret = process.env.JWT_SECRET || JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET não configurado no servidor (.env).');
    }
    return secret;
}

function signToken(user, manterConectado = false) {
    return jwt.sign(
        {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            tenantId: user.tenantId.toString(),
            nome: user.nome
        },
        getSecretOrThrow(),
        { expiresIn: manterConectado ? JWT_EXPIRES_LONG : JWT_EXPIRES }
    );
}

async function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
        return res.status(401).json({ erro: 'Não autenticado' });
    }
    try {
        const decoded = jwt.verify(token, getSecretOrThrow());

        // Verifica se a conta continua ativa (caso o banco esteja conectado)
        if (decoded?.sub && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(decoded.sub)) {
            const now = Date.now();
            let cached = userStatusCache.get(decoded.sub);
            if (!cached || now >= cached.expiresAt) {
                const dbUser = await User().findById(decoded.sub).select('ativo role tenantId').lean();
                if (!dbUser || !dbUser.ativo) {
                    userStatusCache.set(decoded.sub, { ativo: false, expiresAt: now + USER_STATUS_TTL_MS });
                    return res.status(403).json({ erro: 'Conta desativada ou inexistente.' });
                }
                cached = {
                    ativo: true,
                    role: dbUser.role,
                    tenantId: dbUser.tenantId ? dbUser.tenantId.toString() : decoded.tenantId,
                    expiresAt: now + USER_STATUS_TTL_MS
                };
                userStatusCache.set(decoded.sub, cached);
            } else if (!cached.ativo) {
                return res.status(403).json({ erro: 'Conta desativada ou inexistente.' });
            }

            // Sincroniza role e tenantId reais do banco contra adulteração/desatualização
            decoded.role = cached.role || decoded.role;
            decoded.tenantId = cached.tenantId || decoded.tenantId;
        }

        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ erro: 'Acesso restrito ao administrador' });
    }
    next();
}

function tenantFilter(req) {
    if (req.user.role === 'super_admin') {
        return null;
    }
    return { tenantId: req.user.tenantId };
}

module.exports = { signToken, authMiddleware, requireAdmin, tenantFilter, invalidateUserCache, JWT_SECRET };
