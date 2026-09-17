const mongoose = require('mongoose');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

// Use MONGODB_URI no ambiente para não expor credenciais no código em produção
const MONGO_URI = process.env.MONGODB_URI || (
    'mongodb+srv://host:Mikaa%402705%23@3d-manager.hrxumzp.mongodb.net/3dmanager?appName=3d-manager'
);

const vendaSchema = new mongoose.Schema({
    nome: String,
    lucro: Number,
    bruto: Number,
    custo: Number,
    canal: String,
    status: { 
        type: String, 
        enum: ['pre_venda', 'orcamento', 'aguardando_aprovacao', 'aprovado', 'a_pagar', 'em_producao', 'acabamento', 'pronto', 'enviado', 'concluida', 'entregue', 'cancelado'], 
        default: 'concluida' 
    },
    pedidoId: String,
    data: { type: Date, default: Date.now },
    filamentosUsados: [{ estoqueId: String, nome: String, peso: Number, precoKg: Number }],
    detalheCustos: mongoose.Schema.Types.Mixed,
    custosExtras: [{
        custoItemId: String,
        nome: String,
        quantidade: Number,
        custoUnitario: Number,
        subtotal: Number
    }],
    taxas: { comissao: Number, fixa: Number }
});

const custoItemSchema = new mongoose.Schema({
    nome: String,
    categoria: {
        type: String,
        enum: ['insumo', 'manutencao', 'parcela', 'embalagem', 'ferramenta', 'outro'],
        default: 'insumo'
    },
    tipoCalculo: {
        type: String,
        enum: ['lote', 'unitario_fixo', 'parcela_mensal', 'por_hora'],
        default: 'lote'
    },
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
    nome: String,
    precoKg: Number,
    gramas: Number
}, { collection: 'estoques' });

const modeloSchema = new mongoose.Schema({
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
    custosExtras: [{
        custoItemId: String,
        nome: String,
        quantidade: Number,
        custoUnitario: Number,
        subtotal: Number
    }]
}, { collection: 'modelos' });

const impressoraSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    modelo: String,
    potenciaWatts: { type: Number, default: 150 },
    taxaDesgasteHora: { type: Number, default: 0.50 },
    custoHoraTrabalho: { type: Number, default: 1.00 },
    status: { type: String, enum: ['disponivel', 'imprimindo', 'manutencao', 'pausada'], default: 'disponivel' },
    ip: String,
    serial: String,
    accessCode: String,
    tipoConexao: { type: String, default: 'manual' },
    observacao: String,
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: Date.now }
}, { collection: 'impressoras' });

const filaItemSchema = new mongoose.Schema({
    impressoraId: { type: String, required: true },
    impressoraNome: String,
    nomeItem: { type: String, required: true },
    sku: String,
    pedidoId: String,
    vendaId: String,
    modeloId: String,
    tempoEstimadoHoras: { type: Number, default: 1 },
    pesoTotalGramas: { type: Number, default: 0 },
    filamentosUsados: [{ estoqueId: String, nome: String, peso: Number, precoKg: Number }],
    custosExtras: [mongoose.Schema.Types.Mixed],
    quantidade: { type: Number, default: 1 },
    ordem: { type: Number, default: 0 },
    status: { type: String, enum: ['pendente', 'imprimindo', 'pausado', 'concluido', 'cancelado'], default: 'pendente' },
    iniciadoEm: Date,
    concluidoEm: Date,
    observacoes: String,
    criadoEm: { type: Date, default: Date.now }
}, { collection: 'fila_impressao' });

const desperdicioSchema = new mongoose.Schema({
    estoqueId: String,
    materialNome: String,
    gramas: { type: Number, required: true },
    motivo: { type: String, enum: ['peca_falhada', 'purga_troca_cor', 'suportes', 'outro'], default: 'peca_falhada' },
    custoEstimado: Number,
    observacao: String,
    data: { type: Date, default: Date.now }
}, { collection: 'desperdicios' });

function getVendaModel() {
    return mongoose.models.Venda || mongoose.model('Venda', vendaSchema);
}

function getEstoqueModel() {
    return mongoose.models.Estoque || mongoose.model('Estoque', estoqueSchema);
}

function getModeloModel() {
    return mongoose.models.Modelo || mongoose.model('Modelo', modeloSchema);
}

function getCustoItemModel() {
    return mongoose.models.CustoItem || mongoose.model('CustoItem', custoItemSchema);
}

function getImpressoraModel() {
    return mongoose.models.Impressora || mongoose.model('Impressora', impressoraSchema);
}

function getFilaModel() {
    return mongoose.models.Fila || mongoose.model('Fila', filaItemSchema);
}

function getDesperdicioModel() {
    return mongoose.models.Desperdicio || mongoose.model('Desperdicio', desperdicioSchema);
}

async function conectarBanco() {
    if (mongoose.connection.readyState === 1) {
        return true;
    }
    await mongoose.connect(MONGO_URI);
    getVendaModel();
    getEstoqueModel();
    getModeloModel();
    getCustoItemModel();
    getImpressoraModel();
    getFilaModel();
    getDesperdicioModel();
    return true;
}

async function inicializarDadosPadrao() {
    const Venda = getVendaModel();
    const Estoque = getEstoqueModel();
    const Modelo = getModeloModel();

    if ((await Venda.countDocuments()) === 0) {
        await Venda.create({
            nome: 'Item Teste Inicial',
            lucro: 15,
            bruto: 30,
            custo: 15,
            canal: 'direta',
            filamentosUsados: []
        });
    }

    if ((await Estoque.countDocuments()) === 0) {
        await Estoque.create({ nome: 'PLA Amostra Inicial', precoKg: 120, gramas: 1000 });
    }

    if ((await Modelo.countDocuments()) === 0) {
        await Modelo.create({
            nome: 'Exemplo Barquinho Benchy',
            tempo: 1.5,
            energia: 0.95,
            potencia: 150,
            desgaste: 1,
            embalagem: 2.5,
            filamentosUsados: []
        });
    }
}

module.exports = {
    MONGO_URI,
    conectarBanco,
    inicializarDadosPadrao,
    getVendaModel,
    getEstoqueModel,
    getModeloModel,
    getCustoItemModel,
    getImpressoraModel,
    getFilaModel,
    getDesperdicioModel
};
