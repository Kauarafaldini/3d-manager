const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'altere-isso-em-producao-3dmanager';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
const JWT_EXPIRES_LONG = '30d';

function signToken(user, manterConectado = false) {
    return jwt.sign(
        {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            tenantId: user.tenantId.toString(),
            nome: user.nome
        },
        JWT_SECRET,
        { expiresIn: manterConectado ? JWT_EXPIRES_LONG : JWT_EXPIRES }
    );
}

function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ erro: 'Não autenticado' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'super_admin') {
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

module.exports = { signToken, authMiddleware, requireAdmin, tenantFilter, JWT_SECRET };
