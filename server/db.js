const mongoose = require('mongoose');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    throw new Error('MONGODB_URI não definida. Configure no .env ou nas variáveis de ambiente.');
}

const tenantField = { tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true } };

const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    senhaHash: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'client'], default: 'client' },
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    empresa: String,
    ativo: { type: Boolean, default: true },
    lastOnline: { type: Date },
    criadoEm: { type: Date, default: Date.now }
});

const vendaSchema = new mongoose.Schema({
    ...tenantField,
    nome: String,
    lucro: Number,
    bruto: Number,
    custo: Number,
    canal: String,
    data: { type: Date, default: Date.now },
    filamentosUsados: [{ estoqueId: String, nome: String, peso: Number, precoKg: Number }],
    detalheCustos: mongoose.Schema.Types.Mixed,
    custosExtras: [mongoose.Schema.Types.Mixed],
    taxas: { comissao: Number, fixa: Number }
});

const custoItemSchema = new mongoose.Schema({
    ...tenantField,
    nome: String,
    categoria: { type: String, enum: ['insumo', 'manutencao', 'parcela', 'embalagem', 'ferramenta', 'outro'], default: 'insumo' },
    tipoCalculo: { type: String, enum: ['lote', 'unitario_fixo', 'parcela_mensal', 'por_hora'], default: 'lote' },
    precoTotal: Number,
    quantidadeTotal: Number,
    custoUnitario: Number,
    valorMensal: Number,
    horasUsoMes: { type: Number, default: 160 },
    custoPorHora: Number,
    unidade: { type: String, default: 'un' },
    estoqueAtual: Number,
    observacao: String,
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: Date.now }
});

const estoqueSchema = new mongoose.Schema({
    ...tenantField,
    nome: String,
    precoKg: Number,
    gramas: Number
}, { collection: 'estoques' });

const modeloSchema = new mongoose.Schema({
    ...tenantField,
    nome: String,
    peso: Number,
    precoKg: Number,
    tempo: Number,
    energia: Number,
    potencia: Number,
    desgaste: Number,
    trabalhoHora: Number,
    embalagem: Number,
    filamentosUsados: [{ estoqueId: String, nome: String, peso: Number, precoKg: Number }],
    sku: String,
    venda: Number,
    custoProducao: Number,
    custoProducaoTotal: Number,
    quantidadeChapa: { type: Number, default: 1 },
    estoque: { type: Number, default: 0 },
    temReceita: { type: Boolean, default: false },
    custoMat: Number,
    custoEnergia: Number,
    custoMaquina: Number,
    custoTrabalho: Number,
    custoDesgaste: Number,
    custoExtras: Number,
    custosExtras: [mongoose.Schema.Types.Mixed]
}, { collection: 'modelos' });

function model(name, schema) {
    return mongoose.models[name] || mongoose.model(name, schema);
}

const User = () => model('User', userSchema);
const Venda = () => model('Venda', vendaSchema);
const CustoItem = () => model('CustoItem', custoItemSchema);
const Estoque = () => model('Estoque', estoqueSchema);
const Modelo = () => model('Modelo', modeloSchema);

const COLLECTIONS = {
    Venda,
    Estoque,
    Modelo,
    CustoItem
};

async function conectar() {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(MONGO_URI);
}

module.exports = { conectar, User, Venda, CustoItem, Estoque, Modelo, COLLECTIONS, mongoose };
