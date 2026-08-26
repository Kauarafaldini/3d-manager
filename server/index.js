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
        const { nome, email, senha, empresa } = req.body || {};
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios' });
        }
        if (senha.length < 6) {
            return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });
        }
        const emailNorm = String(email).toLowerCase().trim();
        const existe = await User().findOne({ email: emailNorm });
        if (existe) {
            return res.status(409).json({ erro: 'E-mail já cadastrado' });
        }
        const tenantId = new mongoose.Types.ObjectId();
        const user = await User().create({
            nome: String(nome).trim(),
            email: emailNorm,
            senhaHash: await bcrypt.hash(senha, 10),
            role: 'client',
            tenantId,
            empresa: empresa ? String(empresa).trim() : '',
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
        res.status(500).json({ erro: 'Erro ao cadastrar' });
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
// BAMBU LAB INTEGRATION ROUTES
// =============================================
const bambuService = require('./bambu-service');

app.get('/api/bambu/status', (req, res) => {
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

app.post('/api/bambu/connect', async (req, res) => {
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

app.post('/api/bambu/disconnect', async (req, res) => {
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

app.post('/api/bambu/command', async (req, res) => {
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
