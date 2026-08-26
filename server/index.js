require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { conectar, User, COLLECTIONS } = require('./db');
const { signToken, authMiddleware, requireAdmin, tenantFilter } = require('./auth');

const PORT = parseInt(process.env.PORT || process.env.API_PORT || '3847', 10);
const DEV_MODE = process.env.DEV_MODE === 'true'; // Modo de desenvolvimento
const app = express();

// Permite que o app Electron e outros clientes acessem a API
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        db: mongoose.connection.readyState === 1
    });
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, senha, empresa, cpfCnpj, telefone, foto, chavePix } = req.body || {};
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios' });
        }
        if (senha.length < 6) {
            return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });
        }

        // Validação de CPF ou CNPJ obrigatório
        const cleanDoc = String(cpfCnpj || '').replace(/\D/g, '').trim();
        if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length !== 14)) {
            return res.status(400).json({ erro: 'Informe um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos).' });
        }

        const emailNorm = String(email).toLowerCase().trim();
        const existeEmail = await User().findOne({ email: emailNorm });
        if (existeEmail) {
            return res.status(409).json({ erro: 'E-mail já cadastrado.' });
        }

        // Verificação se CPF ou CNPJ já existe
        const existeCpfCnpj = await User().findOne({ cpfCnpj: cleanDoc });
        if (existeCpfCnpj) {
            return res.status(409).json({ erro: 'CPF ou CNPJ já cadastrado em outra conta.' });
        }

        const tenantId = new mongoose.Types.ObjectId();
        const user = await User().create({
            nome: String(nome).trim(),
            email: emailNorm,
            senhaHash: await bcrypt.hash(senha, 10),
            role: 'client',
            tenantId,
            empresa: empresa ? String(empresa).trim() : '',
            cpfCnpj: cleanDoc,
            telefone: telefone ? String(telefone).trim() : '',
            foto: foto || '',
            chavePix: chavePix ? String(chavePix).trim() : '',
            ativo: true,
            lastOnline: new Date()
        });
        const token = signToken(user);
        res.status(201).json({
            token,
            user: sanitizeUser(user)
        });
    } catch (err) {
        console.error('register', err);
        res.status(500).json({ erro: 'Erro ao cadastrar: ' + err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha, manterConectado } = req.body || {};
        if (!email || !senha) {
            return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });
        }
        const user = await User().findOne({ email: String(email).toLowerCase().trim() });
        if (!user || !(await bcrypt.compare(senha, user.senhaHash))) {
            return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
        }
        if (!user.ativo) {
            return res.status(403).json({ erro: 'Conta desativada. Contate o suporte.' });
        }
        user.lastOnline = new Date();
        await user.save();
        res.json({ token: signToken(user, manterConectado), user: sanitizeUser(user) });
    } catch (err) {
        console.error('login', err);
        res.status(500).json({ erro: 'Erro ao entrar' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    const user = await User().findById(req.user.sub);
    if (!user || !user.ativo) {
        return res.status(401).json({ erro: 'Usuário inválido' });
    }
    res.json({ user: sanitizeUser(user) });
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User().findById(req.user.sub);
        if (!user || !user.ativo) {
            return res.status(401).json({ erro: 'Usuário inválido' });
        }

        const { nome, empresa, foto, telefone, chavePix, cpfCnpj } = req.body || {};

        if (nome) user.nome = String(nome).trim();
        if (empresa !== undefined) user.empresa = String(empresa).trim();
        if (foto !== undefined) user.foto = String(foto);
        if (telefone !== undefined) user.telefone = String(telefone).trim();
        if (chavePix !== undefined) user.chavePix = String(chavePix).trim();

        if (cpfCnpj) {
            const cleanDoc = String(cpfCnpj).replace(/\D/g, '').trim();
            if (cleanDoc.length === 11 || cleanDoc.length === 14) {
                // Verificar se outro usuário já tem esse CPF/CNPJ
                const duplicado = await User().findOne({ cpfCnpj: cleanDoc, _id: { $ne: user._id } });
                if (duplicado) {
                    return res.status(409).json({ erro: 'Este CPF/CNPJ já está cadastrado em outra conta.' });
                }
                user.cpfCnpj = cleanDoc;
            }
        }

        await user.save();
        res.json({ ok: true, user: sanitizeUser(user) });
    } catch (err) {
        console.error('put /api/auth/profile', err);
        res.status(500).json({ erro: 'Erro ao atualizar perfil: ' + err.message });
    }
});

app.post('/api/auth/ping', authMiddleware, async (req, res) => {
    await User().findByIdAndUpdate(req.user.sub, { lastOnline: new Date() });
    res.json({ ok: true });
});

function sanitizeUser(u) {
    return {
        id: u._id.toString(),
        nome: u.nome,
        email: u.email,
        role: u.role,
        tenantId: u.tenantId.toString(),
        empresa: u.empresa || '',
        cpfCnpj: u.cpfCnpj || '',
        foto: u.foto || '',
        telefone: u.telefone || '',
        chavePix: u.chavePix || '',
        ativo: u.ativo,
        lastOnline: u.lastOnline
    };
}

function getTenantId(req) {
    if (req.user.role === 'super_admin') {
        const t = req.query.tenantId || req.body?.tenantId;
        if (t) return new mongoose.Types.ObjectId(t);
        if (req.user.tenantId) return new mongoose.Types.ObjectId(req.user.tenantId);
        return null;
    }
    return new mongoose.Types.ObjectId(req.user.tenantId);
}

function registerCollectionRoutes(pathName, ModelFactory) {
    const base = `/api/data/${pathName}`;

    // Middleware opcional de autenticação (pula em modo DEV)
    const optionalAuth = (req, res, next) => {
        if (DEV_MODE) {
            // Em modo DEV, cria um usuário fake
            req.user = {
                sub: '000000000000000000000000',
                role: 'super_admin',
                tenantId: '000000000000000000000000'
            };
            return next();
        }
        return authMiddleware(req, res, next);
    };

    app.get(base, optionalAuth, async (req, res) => {
        const tenantId = getTenantId(req);
        if (!tenantId && req.user.role !== 'super_admin') {
            return res.status(400).json({ erro: 'tenantId obrigatório' });
        }
        const filter = tenantId ? { tenantId } : {};
        if (pathName === 'custos' && req.query.ativos !== '0') {
            filter.ativo = { $ne: false };
        }
        let q = ModelFactory().find(filter);
        const sort = req.query.sort;
        if (sort === '-data') q = q.sort({ data: -1 });
        else if (sort === 'nome') q = q.sort({ nome: 1 });
        const docs = await q.lean();
        res.json(docs.map(serializeDoc));
    });

    app.post(base, optionalAuth, async (req, res) => {
        const tenantId = getTenantId(req);
        if (!tenantId) {
            return res.status(400).json({ erro: 'Sem tenant' });
        }
        const doc = await ModelFactory().create({
            ...req.body,
            tenantId: new mongoose.Types.ObjectId(tenantId)
        });
        res.status(201).json(serializeDoc(doc.toObject()));
    });

    app.patch(`${base}/:id`, optionalAuth, async (req, res) => {
        const tenantId = getTenantId(req);
        const filter = { _id: req.params.id };
        if (tenantId) filter.tenantId = tenantId;
        const doc = await ModelFactory().findOneAndUpdate(filter, { $set: req.body }, { returnDocument: 'after' });
        if (!doc) return res.status(404).json({ erro: 'Não encontrado' });
        res.json(serializeDoc(doc.toObject()));
    });

    app.delete(`${base}/:id`, optionalAuth, async (req, res) => {
        const tenantId = getTenantId(req);
        const filter = { _id: req.params.id };
        if (tenantId) filter.tenantId = tenantId;
        const r = await ModelFactory().deleteOne(filter);
        if (!r.deletedCount) return res.status(404).json({ erro: 'Não encontrado' });
        res.json({ ok: true });
    });
}

registerCollectionRoutes('vendas', COLLECTIONS.Venda);
registerCollectionRoutes('estoque', COLLECTIONS.Estoque);
registerCollectionRoutes('modelos', COLLECTIONS.Modelo);
registerCollectionRoutes('custos', COLLECTIONS.CustoItem);
registerCollectionRoutes('impressoras', COLLECTIONS.Impressora);
registerCollectionRoutes('fila', COLLECTIONS.Fila);
registerCollectionRoutes('desperdicios', COLLECTIONS.Desperdicio);

// =============================================
// GEMINI AI PRICING ASSISTANT
// =============================================
app.post('/api/ai/sugerir-preco', authMiddleware, async (req, res) => {
    try {
        const {
            nomeItem = 'Item 3D Personalizado',
            pesoGramas = 50,
            tempoHoras = 1.5,
            custoTotalProducao = 10,
            custoMaterial = 5,
            canal = 'direta',
            taxaFalha = 5,
            filamentos = [],
            impressoraNome = 'Impressora 3D'
        } = req.body || {};

        const apiKey = process.env.GEMINI_API_KEY;
        const filamentosDesc = Array.isArray(filamentos) && filamentos.length > 0
            ? filamentos.map(f => `${f.nome || 'Filamento'} (${f.peso || 0}g)`).join(', ')
            : `${pesoGramas}g de filamento`;

        // Fallback heurístico inteligente
        const gerarFallback = (analiseExtra = '') => {
            const custo = Math.max(1, parseFloat(custoTotalProducao) || 10);
            let fatorCompetitivo = 2.2; // 120% markup
            let fatorPremium = 3.0;     // 200% markup

            if (canal === 'shopee') {
                fatorCompetitivo = 2.5;
                fatorPremium = 3.4;
            } else if (canal === 'ml') {
                fatorCompetitivo = 2.7;
                fatorPremium = 3.7;
            }

            const precoComp = Math.ceil((custo * fatorCompetitivo) * 10) / 10 - 0.10; // ex: R$ 29.90
            const precoPrem = Math.ceil((custo * fatorPremium) * 10) / 10 - 0.10;     // ex: R$ 39.90
            const markup = Math.round((fatorCompetitivo - 1) * 100);

            return {
                ok: true,
                provedor: 'heuristico',
                precoCompetitivo: Math.max(9.90, Number(precoComp.toFixed(2))),
                precoPremium: Math.max(14.90, Number(precoPrem.toFixed(2))),
                markupRecomendado: markup,
                analiseMercado: analiseExtra || `Para "${nomeItem}" no canal ${canal.toUpperCase()}, o custo de produção base é de R$ ${custo.toFixed(2)}. Produtos deste segmento possuem margem saudável entre ${markup}% e ${markup + 80}%, cobrindo taxas da plataforma e tempo de pós-processamento.`,
                dicasEstrategicas: [
                    'Adicione fotos com boa iluminação e escala comparativa (ex: moeda ou régua) para valorizar o produto.',
                    'Crie variações de cores e ofereça kits de 2 ou mais unidades para diluir taxas fixas de marketplace.',
                    'Destaque na descrição a alta resolução da impressão e o acabamento premium.'
                ]
            };
        };

        if (!apiKey || apiKey === 'sua_chave_gemini_aqui') {
            return res.json(gerarFallback());
        }

        // Chamada à API Google Gemini
        const prompt = `Você é um especialista em precificação e e-commerce de impressão 3D (Print Farm).
Analise este item e sugira uma estratégia de precificação lucrativa:

Item: "${nomeItem}"
Canal de Venda: "${canal}" (direta, shopee ou ml)
Custo Total de Produção: R$ ${Number(custoTotalProducao).toFixed(2)}
Peso: ${pesoGramas}g
Tempo de Impressão: ${tempoHoras} horas
Filamentos: ${filamentosDesc}
Impressora: ${impressoraNome}
Margem de Risco/Falha: ${taxaFalha}%

Responda ESTRITAMENTE em formato JSON com o seguinte schema (sem markdown extra fora do json):
{
  "precoCompetitivo": number,
  "precoPremium": number,
  "markupRecomendado": number,
  "analiseMercado": string,
  "dicasEstrategicas": [string, string, string]
}`;

        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn('[Gemini API] Erro na requisição:', response.status, errText);
                return res.json(gerarFallback(`Sugestão baseada em custos reais de R$ ${custoTotalProducao.toFixed(2)}.`));
            }

            const data = await response.json();
            const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (textResponse) {
                const parsed = JSON.parse(textResponse.replace(/```json\n?|\n?```/g, '').trim());
                return res.json({
                    ok: true,
                    provedor: 'gemini-2.5-flash',
                    precoCompetitivo: Number(parsed.precoCompetitivo || (custoTotalProducao * 2.2)).toFixed(2) * 1,
                    precoPremium: Number(parsed.precoPremium || (custoTotalProducao * 3.0)).toFixed(2) * 1,
                    markupRecomendado: parsed.markupRecomendado || 120,
                    analiseMercado: parsed.analiseMercado || '',
                    dicasEstrategicas: parsed.dicasEstrategicas || []
                });
            } else {
                return res.json(gerarFallback());
            }
        } catch (apiErr) {
            console.error('[Gemini API] Falha na chamada:', apiErr);
            return res.json(gerarFallback());
        }
    } catch (err) {
        console.error('/api/ai/sugerir-preco', err);
        res.status(500).json({ erro: 'Erro ao gerar sugestão de preço' });
    }
});

app.get('/api/admin/clientes', authMiddleware, requireAdmin, async (req, res) => {
    const clients = await User().find({ role: 'client' }).sort({ criadoEm: -1 }).lean();
    const Venda = COLLECTIONS.Venda();
    const result = await Promise.all(clients.map(async (c) => {
        const tid = c.tenantId;
        const [vendasCount, ultimaVenda] = await Promise.all([
            Venda.countDocuments({ tenantId: tid }),
            Venda.findOne({ tenantId: tid }).sort({ data: -1 }).select('data nome').lean()
        ]);
        return {
            id: c._id.toString(),
            nome: c.nome,
            email: c.email,
            empresa: c.empresa || '',
            ativo: c.ativo,
            tenantId: tid.toString(),
            criadoEm: c.criadoEm,
            lastOnline: c.lastOnline,
            vendasCount,
            ultimaVenda: ultimaVenda ? { data: ultimaVenda.data, nome: ultimaVenda.nome } : null
        };
    }));
    res.json({
        total: result.length,
        ativos: result.filter(c => c.ativo).length,
        clientes: result
    });
});

app.patch('/api/admin/clientes/:id', authMiddleware, requireAdmin, async (req, res) => {
    const { ativo } = req.body || {};
    const user = await User().findOne({ _id: req.params.id, role: 'client' });
    if (!user) return res.status(404).json({ erro: 'Cliente não encontrado' });
    if (typeof ativo === 'boolean') user.ativo = ativo;
    await user.save();
    res.json({ user: sanitizeUser(user) });
});

function serializeDoc(d) {
    const o = { ...d, _id: d._id.toString() };
    if (o.tenantId) o.tenantId = o.tenantId.toString();
    return o;
}

// =============================================
// PÁGINA PÚBLICA DE RASTREIO DE PEDIDOS
// =============================================
const { renderTrackingPage } = require('./tracking-template');

app.get('/status/:pedidoId', async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const Venda = COLLECTIONS.Venda();
        const Fila = COLLECTIONS.Fila();
        const Impressora = COLLECTIONS.Impressora();

        // Busca por pedidoId ou _id
        let venda = await Venda.findOne({ pedidoId }).lean();
        if (!venda && mongoose.isValidObjectId(pedidoId)) {
            venda = await Venda.findById(pedidoId).lean();
        }

        // Busca trabalho na fila correspondente
        let filaItem = await Fila.findOne({
            $or: [{ pedidoId }, { vendaId: venda?._id ? String(venda._id) : null }]
        }).lean();

        // Telemetria da impressora se estiver ativa
        let liveTelemetry = null;
        if (filaItem?.impressoraId) {
            const imp = await Impressora.findById(filaItem.impressoraId).lean();
            if (imp?.serial) {
                liveTelemetry = printerConnector.getPrinterStatus(imp.serial);
            }
        }

        const dataHtml = {
            pedidoId: venda?.pedidoId || filaItem?.pedidoId || pedidoId,
            nomeCliente: venda?.nome || filaItem?.nomeItem || 'Cliente',
            nomeItem: filaItem?.nomeItem || venda?.nome || 'Impressão 3D Sob Medida',
            quantidade: venda?.quantidade || filaItem?.quantidade || 1,
            statusFila: filaItem?.status || (venda?.status === 'concluida' ? 'concluido' : 'pendente'),
            statusVenda: venda?.status || 'concluida',
            percentual: liveTelemetry?.percent || (filaItem?.status === 'concluido' ? 100 : 0),
            tempoRestante: liveTelemetry?.remainingFormatted || (filaItem?.tempoEstimadoHoras ? `${filaItem.tempoEstimadoHoras}h` : ''),
            impressoraNome: filaItem?.impressoraNome || 'Print Farm 3D',
            dataCriacao: venda?.data ? new Date(venda.data).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
            filamentos: venda?.filamentosUsados || filaItem?.filamentosUsados || [],
            codigoRastreio: venda?.sku || '',
            observacoes: filaItem?.observacoes || '',
            nomeEmpresa: '3D Manager Studio'
        };

        const html = renderTrackingPage(dataHtml);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        console.error('/status/:pedidoId', err);
        res.status(500).send('<h1>Erro ao carregar rastreio de pedido</h1><p>' + err.message + '</p>');
    }
});

app.get('/api/rastreio/:pedidoId', async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const Venda = COLLECTIONS.Venda();
        const Fila = COLLECTIONS.Fila();

        let venda = await Venda.findOne({ pedidoId }).lean();
        if (!venda && mongoose.isValidObjectId(pedidoId)) {
            venda = await Venda.findById(pedidoId).lean();
        }

        let filaItem = await Fila.findOne({
            $or: [{ pedidoId }, { vendaId: venda?._id ? String(venda._id) : null }]
        }).lean();

        res.json({
            ok: true,
            pedidoId,
            venda: venda ? serializeDoc(venda) : null,
            fila: filaItem ? serializeDoc(filaItem) : null
        });
    } catch (err) {
        console.error('/api/rastreio/:pedidoId', err);
        res.status(500).json({ ok: false, erro: err.message });
    }
});

// =============================================
// UNIFIED PRINTERS & TELEMETRY HUB
// =============================================
const bambuService = require('./bambu-service');
const printerConnector = require('./printer-connector');

// Configuração da Automação de Conclusão da Fila via Telemetria (Zero Cliques)
printerConnector.setFinishCallback(async (protocol, identifier, telemetry) => {
    try {
        console.log(`[AUTOMAÇÃO FILA] Processando conclusão da impressora ${identifier} (${protocol})...`);
        const Fila = COLLECTIONS.Fila();
        const Estoque = COLLECTIONS.Estoque();
        const Impressora = COLLECTIONS.Impressora();

        // Encontra a impressora no banco
        const imp = await Impressora.findOne({
            $or: [{ serial: identifier }, { ip: identifier }, { _id: mongoose.isValidObjectId(identifier) ? identifier : null }]
        });

        const impId = imp ? String(imp._id) : identifier;

        // Encontra o trabalho atualmente em impressão nesta impressora
        const jobAtivo = await Fila.findOne({
            impressoraId: impId,
            status: 'imprimindo'
        });

        if (jobAtivo) {
            console.log(`[AUTOMAÇÃO FILA] Finalizando trabalho ativo: "${jobAtivo.nomeItem}" (ID: ${jobAtivo._id})`);
            jobAtivo.status = 'concluido';
            jobAtivo.concluidoEm = new Date();
            await jobAtivo.save();

            // 1. Dá baixa automática no filamento consumido
            if (Array.isArray(jobAtivo.filamentosUsados) && jobAtivo.filamentosUsados.length > 0) {
                for (const f of jobAtivo.filamentosUsados) {
                    if (f.estoqueId && f.peso > 0) {
                        const spool = await Estoque.findById(f.estoqueId);
                        if (spool) {
                            const novoPeso = Math.max(0, (spool.gramas || 0) - f.peso);
                            console.log(`[AUTOMAÇÃO FILA] Baixa no carretel "${spool.nome}": ${spool.gramas}g -> ${novoPeso}g (-${f.peso}g)`);
                            spool.gramas = novoPeso;
                            await spool.save();
                        }
                    }
                }
            } else if (jobAtivo.pesoTotalGramas > 0) {
                console.log(`[AUTOMAÇÃO FILA] Trabalho concluído com peso total de ${jobAtivo.pesoTotalGramas}g.`);
            }

            // 2. Avança para o próximo trabalho pendente na fila desta impressora
            const proximoJob = await Fila.findOne({
                impressoraId: impId,
                status: 'pendente'
            }).sort({ ordem: 1, criadoEm: 1 });

            if (proximoJob) {
                console.log(`[AUTOMAÇÃO FILA] Avançando fila: Próximo trabalho "${proximoJob.nomeItem}" marcado como pronto para impressão!`);
                // Mantém como pendente ou avança para imprimindo conforme a fila
            }
        }
    } catch (autoErr) {
        console.error('[AUTOMAÇÃO FILA] Erro ao processar conclusão automática:', autoErr);
    }
});

// Rotas de Conexão Multi-Impressoras (Bambu, Klipper, OctoPrint)
app.post('/api/printers/connect', authMiddleware, async (req, res) => {
    try {
        const { protocol = 'bambu', ip, port, serial, accessCode, apiKey, nome, useSimulator, id } = req.body || {};

        if (protocol === 'klipper') {
            const result = await printerConnector.connectKlipper({ id, nome, ip, port: port || 7125 });
            return res.json(result);
        }

        if (protocol === 'octoprint') {
            const result = await printerConnector.connectOctoPrint({ id, nome, ip, port: port || 5000, apiKey });
            return res.json(result);
        }

        // Padrão: Bambu Lab
        const result = await bambuService.connectPrinter({
            ip: ip ? String(ip).trim() : '',
            serial: String(serial || id || 'BAMBU_PRINTER').trim(),
            accessCode: accessCode ? String(accessCode).trim() : '',
            nome: nome ? String(nome).trim() : 'Bambu Lab',
            useSimulator: !!useSimulator
        });
        res.json(result);
    } catch (err) {
        console.error('printers/connect', err);
        res.status(500).json({ ok: false, erro: err.message });
    }
});

app.post('/api/printers/disconnect', authMiddleware, async (req, res) => {
    try {
        const { id, serial, protocol = 'bambu' } = req.body || {};
        const ident = serial || id;
        if (protocol === 'klipper') {
            printerConnector.disconnectKlipper(ident);
            return res.json({ ok: true });
        }
        if (protocol === 'octoprint') {
            printerConnector.disconnectOctoPrint(ident);
            return res.json({ ok: true });
        }
        const result = await bambuService.disconnectPrinter(ident);
        res.json(result);
    } catch (err) {
        console.error('printers/disconnect', err);
        res.status(500).json({ ok: false, erro: err.message });
    }
});

app.get('/api/printers/status', authMiddleware, (req, res) => {
    try {
        const { serial, id } = req.query;
        const ident = serial || id;
        if (ident) {
            const status = printerConnector.getPrinterStatus(ident);
            return res.json(status);
        }
        const bambuList = bambuService.getAllPrinters();
        res.json({ printers: bambuList });
    } catch (err) {
        console.error('printers/status', err);
        res.status(500).json({ erro: err.message });
    }
});

// Rotas Bambu Lab legadas / compatibilidade
app.get('/api/bambu/status', authMiddleware, (req, res) => {
    try {
        const { serial } = req.query;
        if (serial) {
            const status = bambuService.getStatus(serial);
            return res.json(status);
        }
        const printers = bambuService.getAllPrinters();
        res.json({ printers });
    } catch (err) {
        console.error('bambu/status', err);
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/bambu/connect', authMiddleware, async (req, res) => {
    try {
        const { ip, serial, accessCode, nome, useSimulator } = req.body || {};
        if (!serial) {
            return res.status(400).json({ erro: 'Serial da impressora é obrigatório' });
        }
        const result = await bambuService.connectPrinter({
            ip: ip ? String(ip).trim() : '',
            serial: String(serial).trim(),
            accessCode: accessCode ? String(accessCode).trim() : '',
            nome: nome ? String(nome).trim() : 'Bambu Lab',
            useSimulator: !!useSimulator
        });
        res.json(result);
    } catch (err) {
        console.error('bambu/connect', err);
        res.status(500).json({ ok: false, erro: err.message });
    }
});

app.post('/api/bambu/disconnect', authMiddleware, async (req, res) => {
    try {
        const { serial } = req.body || {};
        if (!serial) {
            return res.status(400).json({ erro: 'Serial é obrigatório' });
        }
        const result = await bambuService.disconnectPrinter(serial);
        res.json(result);
    } catch (err) {
        console.error('bambu/disconnect', err);
        res.status(500).json({ ok: false, erro: err.message });
    }
});

app.post('/api/bambu/command', authMiddleware, async (req, res) => {
    try {
        const { serial, command, mode } = req.body || {};
        if (!serial) {
            return res.status(400).json({ erro: 'Serial é obrigatório' });
        }
        if (command === 'chamber_light') {
            const result = await bambuService.toggleChamberLight(serial, mode || 'on');
            return res.json(result);
        }
        if (command === 'pushall') {
            const result = await bambuService.sendCommand(serial, {
                pushing: { sequence_id: '1', command: 'pushall' }
            });
            return res.json(result);
        }
        if (command === 'pause' || command === 'resume' || command === 'stop') {
            const result = await bambuService.sendCommand(serial, {
                print: { sequence_id: '0', command }
            });
            return res.json(result);
        }
        res.status(400).json({ erro: `Comando desconhecido: ${command}` });
    } catch (err) {
        console.error('bambu/command', err);
        res.status(500).json({ ok: false, erro: err.message });
    }
});

async function seedAdmin() {
    const email = (process.env.ADMIN_EMAIL || 'admin@3dmanager.local').toLowerCase();
    const senha = process.env.ADMIN_PASSWORD || 'Admin@3dm2026';
    let admin = await User().findOne({ email });
    if (!admin) {
        const tenantId = new mongoose.Types.ObjectId();
        admin = await User().create({
            nome: 'Administrador',
            email,
            senhaHash: await bcrypt.hash(senha, 10),
            role: 'super_admin',
            tenantId,
            ativo: true
        });
        console.log(`Admin criado: ${email}`);
    }
}

async function start() {
    await conectar();
    await seedAdmin();
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`API 3D Manager em http://0.0.0.0:${PORT}`);
    });

    server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Erro: porta ${PORT} já está em uso. Feche o processo que está usando essa porta ou defina API_PORT em .env para outra porta.`);
            process.exit(1);
        }
        throw err;
    });
}

if (require.main === module) {
    start().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { app, start, PORT };
