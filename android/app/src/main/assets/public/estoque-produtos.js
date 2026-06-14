// ==========================================
// MÓDULO DE ESTOQUE DE PRODUTOS
// ==========================================

let estoqueProdutosCache = [];
let produtoSelecionadoTerminal = null;

// ==========================================
// FUNÇÕES DE BANCO DE DADOS
// ==========================================

function getEstoqueProdutoModel() {
    if (typeof getModeloModel === 'function') {
        return getModeloModel();
    }
    return null;
}

async function carregarEstoqueProdutos() {
    try {
        const ModeloModel = getEstoqueProdutoModel();
        if (!ModeloModel) return;

        const modelos = await ModeloModel.find().lean();
        estoqueProdutosCache = modelos.map(m => ({
            ...m,
            estoque: m.estoque || 0,
            precoVenda: m.venda || 0
        }));

        renderizarListaEstoqueProdutos();
        atualizarSelectProducao();
    } catch (err) {
        console.error('Erro ao carregar estoque de produtos:', err);
    }
}

async function atualizarEstoqueProduto(modeloId, quantidade, tipo) {
    try {
        const ModeloModel = getEstoqueProdutoModel();
        if (!ModeloModel) return;

        const produto = await ModeloModel.findById(modeloId);
        if (!produto) return;

        const estoqueAtual = produto.estoque || 0;
        const novoEstoque = tipo === 'entrada' ? estoqueAtual + quantidade : Math.max(0, estoqueAtual - quantidade);

        await ModeloModel.findByIdAndUpdate(modeloId, { estoque: novoEstoque });

        // Atualizar cache
        const cacheIndex = estoqueProdutosCache.findIndex(p => p._id.toString() === modeloId.toString());
        if (cacheIndex !== -1) {
            estoqueProdutosCache[cacheIndex].estoque = novoEstoque;
        }

        return novoEstoque;
    } catch (err) {
        console.error('Erro ao atualizar estoque:', err);
        throw err;
    }
}

// ==========================================
// FUNÇÕES DE INTERFACE - ESTOQUE
// ==========================================

function renderizarListaEstoqueProdutos(filtro = '') {
    const container = document.getElementById('lista-estoque-produtos');
    if (!container) return;

    const produtosFiltrados = estoqueProdutosCache.filter(p => {
        if (!filtro) return true;
        const termo = filtro.toLowerCase();
        return (p.nome && p.nome.toLowerCase().includes(termo)) ||
               (p.sku && p.sku.toLowerCase().includes(termo));
    });

    if (!produtosFiltrados.length) {
        container.innerHTML = '<p class="empty-msg">Nenhum produto cadastrado. Crie modelos na Calculadora.</p>';
        return;
    }

    container.innerHTML = produtosFiltrados.map(p => `
        <div class="item-row">
            <div class="item-info">
                <b>${p.nome}</b>
                <span>${p.sku || 'Sem SKU'}</span>
                <small style="color:#64748b;display:block;margin-top:4px;">
                    Estoque: ${p.estoque || 0} un. · Preço: R$ ${(p.precoVenda || 0).toFixed(2)}
                </small>
            </div>
            <div class="item-actions">
                <span class="badge-status ${p.estoque > 0 ? 'ativo' : 'inativo'}">${p.estoque || 0}</span>
            </div>
        </div>
    `).join('');
}

function filtrarEstoqueProdutos() {
    const filtro = document.getElementById('estoqueBusca').value;
    renderizarListaEstoqueProdutos(filtro);
}

function atualizarSelectProducao() {
    const select = document.getElementById('prodSelectProducao');
    if (!select) return;

    select.innerHTML = '<option value="">-- Selecione um produto --</option>' +
        estoqueProdutosCache.map(p => `
            <option value="${p._id}">${p.nome} ${p.sku ? `(${p.sku})` : ''}</option>
        `).join('');
}

function atualizarInfoProducao() {
    const select = document.getElementById('prodSelectProducao');
    const modeloId = select.value;
    const quantidade = parseInt(document.getElementById('prodQuantidade').value) || 1;

    const produto = estoqueProdutosCache.find(p => p._id.toString() === modeloId);

    const estoqueAtual = produto ? (produto.estoque || 0) : 0;
    const quantidadeChapa = produto ? (produto.quantidadeChapa || 1) : 1;
    const quantidadeTotal = quantidade * quantidadeChapa;
    const estoqueNovo = estoqueAtual + quantidadeTotal;

    document.getElementById('prodEstoqueAtual').textContent = estoqueAtual;
    document.getElementById('prodEstoqueNovo').textContent = estoqueNovo;

    // Mostrar informações adicionais
    const infoDiv = document.getElementById('prodInfoAdicional');
    if (infoDiv && produto) {
        infoDiv.innerHTML = `
            <p style="margin: 5px 0; font-size: 12px; color: #64748b;">
                Quantidade por chapa: ${quantidadeChapa} un.<br>
                Total a produzir: ${quantidadeTotal} un.
            </p>
        `;
    }
}

async function registrarProducao() {
    const select = document.getElementById('prodSelectProducao');
    const modeloId = select.value;
    const quantidadeProducoes = parseInt(document.getElementById('prodQuantidade').value) || 1;
    const lote = document.getElementById('prodLote').value;

    if (!modeloId) {
        return alert('Selecione um produto.');
    }

    if (quantidadeProducoes <= 0) {
        return alert('Quantidade deve ser maior que zero.');
    }

    try {
        const produto = estoqueProdutosCache.find(p => p._id.toString() === modeloId);
        if (!produto) {
            return alert('Produto não encontrado.');
        }

        const quantidadeChapa = produto.quantidadeChapa || 1;
        const quantidadeTotal = quantidadeProducoes * quantidadeChapa;

        await atualizarEstoqueProduto(modeloId, quantidadeTotal, 'entrada');

        // Registrar produção no financeiro (custos de produção)
        const VendaModel = typeof getVendaModel === 'function' ? getVendaModel() : null;
        if (VendaModel) {
            const custoProducaoTotal = produto.custoProducaoTotal || 0;
            const custoTotalProducao = custoProducaoTotal * quantidadeProducoes;

            const novaProducao = new VendaModel({
                nome: produto.nome,
                sku: produto.sku,
                lucro: -custoTotalProducao, // Produção é custo, não lucro
                bruto: 0,
                custo: custoTotalProducao,
                canal: 'producao',
                quantidade: quantidadeTotal,
                pedidoId: lote || `PROD-${Date.now()}`,
                detalheCustos: {
                    material: produto.custoMat || 0,
                    energia: produto.custoEnergia || 0,
                    maquina: produto.custoMaquina || 0,
                    trabalho: produto.custoTrabalho || 0,
                    desgaste: produto.custoDesgaste || 0,
                    embalagem: produto.embalagem || 0,
                    extras: produto.custoExtras || 0,
                    tempoHoras: produto.tempo || 0,
                    quantidadeChapa: quantidadeChapa
                },
                tipo: 'producao'
            });

            await novaProducao.save();
        }

        if (typeof mostrarToast === 'function') {
            mostrarToast(`Produção registrada: +${quantidadeTotal} un. (${quantidadeProducoes}x chapa)`);
        }

        // Limpar formulário
        document.getElementById('prodQuantidade').value = 1;
        document.getElementById('prodLote').value = '';
        select.value = '';
        atualizarInfoProducao();

        // Atualizar listas
        renderizarListaEstoqueProdutos();
        carregarEstoqueProdutos();
    } catch (err) {
        alert('Erro ao registrar produção: ' + err.message);
    }
}

// ==========================================
// FUNÇÕES DE INTERFACE - TERMINAL
// ==========================================

function buscarProdutoTerminal() {
    const termo = document.getElementById('termBuscaProduto').value.toLowerCase().trim();
    const container = document.getElementById('termResultadoBusca');

    if (!termo) {
        container.innerHTML = '';
        return;
    }

    const resultados = estoqueProdutosCache.filter(p => {
        return (p.nome && p.nome.toLowerCase().includes(termo)) ||
               (p.sku && p.sku.toLowerCase().includes(termo));
    });

    if (!resultados.length) {
        container.innerHTML = '<p class="empty-msg">Nenhum produto encontrado.</p>';
        return;
    }

    container.innerHTML = resultados.map(p => `
        <div class="item-row" onclick="selecionarProdutoTerminal('${p._id}')" style="cursor:pointer;">
            <div class="item-info">
                <b>${p.nome}</b>
                <span>${p.sku || 'Sem SKU'}</span>
                <small style="color:#64748b;display:block;margin-top:4px;">
                    Estoque: ${p.estoque || 0} un. · Preço: R$ ${(p.precoVenda || 0).toFixed(2)}
                </small>
            </div>
            <div class="item-actions">
                <span class="badge-status ${p.estoque > 0 ? 'ativo' : 'inativo'}">${p.estoque || 0}</span>
            </div>
        </div>
    `).join('');
}

function atualizarTotalVenda() {
    const quantidade = parseInt(document.getElementById('termQuantidade').value) || 1;
    const preco = parseFloat(document.getElementById('termProdPreco').textContent.replace('R$', '').trim()) || 0;
    const total = quantidade * preco;
    document.getElementById('termTotalVenda').textContent = `R$ ${total.toFixed(2)}`;
}

function selecionarProdutoTerminal(modeloId) {
    const produto = estoqueProdutosCache.find(p => p._id.toString() === modeloId);
    if (!produto) return;

    produtoSelecionadoTerminal = produto;

    document.getElementById('termProdNome').textContent = produto.nome;
    document.getElementById('termProdSKU').textContent = produto.sku || 'Sem SKU';
    document.getElementById('termProdEstoque').textContent = produto.estoque || 0;
    document.getElementById('termProdPreco').textContent = `R$ ${(produto.precoVenda || 0).toFixed(2)}`;

    document.getElementById('termResultadoBusca').innerHTML = '';
    document.getElementById('termFormVenda').style.display = 'block';

    atualizarTotalVenda();
}

function atualizarTotalVenda() {
    if (!produtoSelecionadoTerminal) return;

    const quantidade = parseInt(document.getElementById('termQuantidade').value) || 1;
    const preco = produtoSelecionadoTerminal.precoVenda || 0;
    const total = quantidade * preco;

    document.getElementById('termTotalVenda').textContent = `R$ ${total.toFixed(2)}`;
}

function limparTerminal() {
    produtoSelecionadoTerminal = null;
    document.getElementById('termBuscaProduto').value = '';
    document.getElementById('termResultadoBusca').innerHTML = '';
    document.getElementById('termFormVenda').style.display = 'none';
    document.getElementById('termQuantidade').value = 1;
    document.getElementById('termCanal').value = 'direta';
    document.getElementById('termPedidoId').value = '';
}

async function efetuarVendaTerminal() {
    if (!produtoSelecionadoTerminal) {
        return alert('Selecione um produto.');
    }

    const quantidade = parseInt(document.getElementById('termQuantidade').value) || 1;
    const canal = document.getElementById('termCanal').value;
    const pedidoId = document.getElementById('termPedidoId').value;

    const estoqueAtual = produtoSelecionadoTerminal.estoque || 0;

    if (quantidade > estoqueAtual) {
        return alert(`Estoque insuficiente. Disponível: ${estoqueAtual}, Solicitado: ${quantidade}`);
    }

    try {
        // Dar baixa no estoque
        await atualizarEstoqueProduto(produtoSelecionadoTerminal._id, quantidade, 'saida');

        // Registrar venda no banco
        const VendaModel = typeof getVendaModel === 'function' ? getVendaModel() : null;
        if (VendaModel) {
            const precoUnitario = produtoSelecionadoTerminal.precoVenda || 0;
            const valorTotal = quantidade * precoUnitario;

            const novaVenda = new VendaModel({
                nome: produtoSelecionadoTerminal.nome,
                sku: produtoSelecionadoTerminal.sku,
                lucro: valorTotal - (produtoSelecionadoTerminal.custoProducao || 0) * quantidade,
                bruto: valorTotal,
                custo: (produtoSelecionadoTerminal.custoProducao || 0) * quantidade,
                canal: canal,
                quantidade: quantidade,
                pedidoId: pedidoId,
                detalheCustos: {
                    material: produtoSelecionadoTerminal.custoMat || 0,
                    energia: produtoSelecionadoTerminal.custoEnergia || 0,
                    maquina: produtoSelecionadoTerminal.custoMaquina || 0,
                    trabalho: produtoSelecionadoTerminal.custoTrabalho || 0,
                    desgaste: produtoSelecionadoTerminal.custoDesgaste || 0,
                    embalagem: produtoSelecionadoTerminal.embalagem || 0,
                    extras: produtoSelecionadoTerminal.custoExtras || 0,
                    tempoHoras: produtoSelecionadoTerminal.tempo || 0
                }
            });

            await novaVenda.save();
        }

        if (typeof mostrarToast === 'function') {
            mostrarToast(`Venda registrada: -${quantidade} un. de ${produtoSelecionadoTerminal.nome}`);
        }

        limparTerminal();
        carregarEstoqueProdutos();
        renderizarUltimasVendas();
    } catch (err) {
        alert('Erro ao efetuar venda: ' + err.message);
    }
}

async function renderizarUltimasVendas() {
    const container = document.getElementById('termUltimasVendas');
    if (!container) return;

    try {
        const VendaModel = typeof getVendaModel === 'function' ? getVendaModel() : null;
        if (!VendaModel) return;

        const vendas = await VendaModel.find().sort({ data: -1 }).limit(10).lean();

        if (!vendas.length) {
            container.innerHTML = '<p class="empty-msg">Nenhuma venda registrada.</p>';
            return;
        }

        container.innerHTML = vendas.map(v => `
            <div class="item-row">
                <div class="item-info">
                    <b>${v.nome}</b>
                    <span>${v.sku || ''}</span>
                    <small style="color:#64748b;display:block;margin-top:4px;">
                        ${new Date(v.data).toLocaleString('pt-BR')} · ${v.quantidade || 1} un. · R$ ${(v.bruto || 0).toFixed(2)}
                    </small>
                </div>
                <div class="item-actions">
                    <span class="badge-status ativo">${v.canal || 'Direta'}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar últimas vendas:', err);
    }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Event listener para atualizar total quando quantidade muda
    const termQuantidade = document.getElementById('termQuantidade');
    if (termQuantidade) {
        termQuantidade.addEventListener('input', atualizarTotalVenda);
    }

    const prodQuantidade = document.getElementById('prodQuantidade');
    if (prodQuantidade) {
        prodQuantidade.addEventListener('input', atualizarInfoProducao);
    }
});
