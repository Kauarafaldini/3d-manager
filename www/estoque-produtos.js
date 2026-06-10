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
        const model = getModeloModel();
        console.log('getModeloModel retornou:', model);
        return model;
    }
    console.log('getModeloModel não está disponível');
    return null;
}

async function carregarEstoqueProdutos() {
    console.log('=== INICIANDO carregarEstoqueProdutos ===');
    try {
        const ModeloModel = getEstoqueProdutoModel();
        console.log('ModeloModel obtido:', ModeloModel);
        if (!ModeloModel) {
            console.log('ERRO: ModeloModel é null');
            return;
        }

        const modelos = await ModeloModel.find().lean();
        console.log('Modelos carregados do banco:', modelos.length);
        estoqueProdutosCache = modelos.map(m => ({
            ...m,
            estoque: m.estoque || 0,
            precoVenda: m.venda || 0
        }));
        console.log('Cache de estoque atualizado:', estoqueProdutosCache.length);

        console.log('Chamando renderizarListaEstoqueProdutos...');
        renderizarListaEstoqueProdutos();
        console.log('Chamando atualizarResumoEstoqueProdutos...');
        atualizarResumoEstoqueProdutos();
        console.log('Chamando atualizarSelectProducao...');
        atualizarSelectProducao();
        console.log('Estoque de produtos atualizado com sucesso:', estoqueProdutosCache.length);
    } catch (err) {
        console.error('Erro ao carregar estoque de produtos:', err);
    }
}

if (typeof window !== 'undefined') {
    window.carregarEstoqueProdutos = carregarEstoqueProdutos;
    window.atualizarSelectProducao = atualizarSelectProducao;
    window.atualizarInfoProducao = atualizarInfoProducao;
    window.registrarProducao = registrarProducao;
    window.buscarProdutoTerminal = buscarProdutoTerminal;
    window.selecionarProdutoTerminal = selecionarProdutoTerminal;
    window.efetuarVendaTerminal = efetuarVendaTerminal;
    window.limparTerminal = limparTerminal;
    window.filtrarEstoqueProdutos = filtrarEstoqueProdutos;
    window.filtrarMovimentacoesTerminal = filtrarMovimentacoesTerminal;
    window.subNavTerminal = subNavTerminal;
    window.iniciarAtualizacaoAutomatica = iniciarAtualizacaoAutomatica;
    window.pararAtualizacaoAutomatica = pararAtualizacaoAutomatica;
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
    console.log('=== INICIANDO renderizarListaEstoqueProdutos ===');
    console.log('Filtro:', filtro);
    console.log('Cache de estoque:', estoqueProdutosCache.length);
    const container = document.getElementById('lista-estoque-produtos');
    if (!container) {
        console.log('ERRO: Container lista-estoque-produtos não encontrado');
        return;
    }

    const produtosFiltrados = estoqueProdutosCache.filter(p => {
        if (!filtro) return true;
        const termo = filtro.toLowerCase();
        return (p.nome && p.nome.toLowerCase().includes(termo)) ||
               (p.sku && p.sku.toLowerCase().includes(termo));
    });

    console.log('Produtos filtrados:', produtosFiltrados.length);

    if (!produtosFiltrados.length) {
        container.innerHTML = '<p class="empty-msg">Nenhum produto cadastrado. Crie modelos na Calculadora.</p>';
        console.log('Nenhum produto para exibir');
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
    atualizarResumoEstoqueProdutos(produtosFiltrados);
    console.log('Lista renderizada com sucesso');
}

function atualizarResumoEstoqueProdutos(itensFiltrados = null) {
    const produtos = itensFiltrados || estoqueProdutosCache;
    const totalProdutos = produtos.length;
    const totalQuantidade = produtos.reduce((sum, item) => sum + (Number(item.estoque) || 0), 0);
    const totalValor = produtos.reduce((sum, item) => sum + ((Number(item.estoque) || 0) * (Number(item.precoVenda) || 0)), 0);

    const totalProdutosEl = document.getElementById('estoqueTotalProdutos');
    const totalQuantidadeEl = document.getElementById('estoqueTotalQuantidade');
    const totalValorEl = document.getElementById('estoqueTotalValor');
    if (totalProdutosEl) totalProdutosEl.textContent = totalProdutos;
    if (totalQuantidadeEl) totalQuantidadeEl.textContent = `${totalQuantidade} un.`;
    if (totalValorEl) totalValorEl.textContent = `R$ ${totalValor.toFixed(2)}`;
}

function filtrarEstoqueProdutos() {
    const filtro = document.getElementById('estoqueBusca').value;
    renderizarListaEstoqueProdutos(filtro);
}

function atualizarSelectProducao() {
    console.log('=== INICIANDO atualizarSelectProducao ===');
    const select = document.getElementById('prodSelectProducao');
    if (!select) {
        console.log('ERRO: Select prodSelectProducao não encontrado');
        return;
    }

    select.innerHTML = '<option value="">-- Selecione um produto --</option>' +
        estoqueProdutosCache.map(p => `
            <option value="${p._id}">${p.nome} ${p.sku ? `(${p.sku})` : ''}</option>
        `).join('');
    console.log('Select de produção atualizado com', estoqueProdutosCache.length, 'produtos');
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

        const EstoqueModel = typeof getEstoqueModel === 'function' ? getEstoqueModel() : null;
        if (EstoqueModel && produto.filamentosUsados?.length) {
            for (const f of produto.filamentosUsados) {
                if (!f.estoqueId) continue;
                const filamentoId = String(f.estoqueId);
                const filamento = typeof estoqueCache !== 'undefined'
                    ? estoqueCache.find(e => e._id && String(e._id) === filamentoId)
                    : null;
                if (!filamento) continue;
                const gramasUsadas = (Number(f.peso) || 0) * quantidadeProducoes;
                const novaQuantidade = Math.max(0, (Number(filamento.gramas) || 0) - gramasUsadas);
                await EstoqueModel.findByIdAndUpdate(filamentoId, { gramas: novaQuantidade });
                filamento.gramas = novaQuantidade;
            }
            if (typeof atualizarInterface === 'function') {
                await atualizarInterface();
            }
        }

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

async function renderizarUltimasVendas(filtro = '') {
    const container = document.getElementById('termUltimasVendas');
    if (!container) return;

    try {
        const VendaModel = typeof getVendaModel === 'function' ? getVendaModel() : null;
        if (!VendaModel) return;

        const vendas = await VendaModel.find().sort({ data: -1 }).lean();
        const termo = filtro.trim().toLowerCase();
        const vendasFiltradas = termo ? vendas.filter(v => {
            const texto = `${v.nome || ''} ${v.sku || ''} ${v.canal || ''} ${v.pedidoId || ''}`.toLowerCase();
            return texto.includes(termo);
        }) : vendas;

        const hoje = new Date();
        const vendasHoje = vendas.filter(v => {
            const dataVenda = new Date(v.data);
            return dataVenda.toDateString() === hoje.toDateString();
        });
        const totalDia = vendasHoje.reduce((sum, v) => sum + (Number(v.bruto) || 0), 0);
        const qtdeVendida = vendasHoje.reduce((sum, v) => sum + (Number(v.quantidade) || 1), 0);
        const ticketMedio = vendasHoje.length ? totalDia / vendasHoje.length : 0;

        document.getElementById('termVendasHoje')?.textContent = vendasHoje.length;
        document.getElementById('termTotalDia')?.textContent = `R$ ${totalDia.toFixed(2)}`;
        document.getElementById('termTicketMedio')?.textContent = `R$ ${ticketMedio.toFixed(2)}`;
        document.getElementById('termProdutosVendidos')?.textContent = qtdeVendida;

        if (!vendasFiltradas.length) {
            container.innerHTML = '<p class="empty-msg">Nenhuma movimentação encontrada.</p>';
            return;
        }

        container.innerHTML = vendasFiltradas.map(v => `
            <div class="item-row">
                <div class="item-info">
                    <b>${v.nome}</b>
                    <span>${v.sku || ''}</span>
                    <small style="color:#64748b;display:block;margin-top:4px;">
                        Nota: ${v.pedidoId || '—'} · ${new Date(v.data).toLocaleString('pt-BR')} · ${v.quantidade || 1} un.
                    </small>
                </div>
                <div class="item-actions">
                    <span class="badge-status ativo">${v.canal || 'Direta'}</span>
                    <span class="badge-status" style="margin-left:8px;background:rgba(255,255,255,0.08);color:#f8fafc;">R$ ${(v.bruto || 0).toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar últimas vendas:', err);
    }
}

function subNavTerminal(view) {
    const saleView = document.getElementById('termSaleView');
    const historyView = document.getElementById('termHistoryView');
    const buttons = document.querySelectorAll('.term-nav-btn');

    if (!saleView || !historyView) return;

    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'movimentacoes') {
        saleView.style.display = 'none';
        historyView.style.display = 'block';
        if (typeof renderizarUltimasVendas === 'function') {
            const filtro = document.getElementById('termMovimentoBusca')?.value || '';
            renderizarUltimasVendas(filtro);
        }
    } else {
        saleView.style.display = 'block';
        historyView.style.display = 'none';
    }
}

function filtrarMovimentacoesTerminal() {
    const filtro = document.getElementById('termMovimentoBusca')?.value || '';
    renderizarUltimasVendas(filtro);
}

// ==========================================
// ATUALIZAÇÃO AUTOMÁTICA
// ==========================================

let autoUpdateInterval = null;

function iniciarAtualizacaoAutomatica() {
    // Limpar intervalo existente se houver
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }
    
    // Limpar cache e atualizar imediatamente
    estoqueProdutosCache = [];
    carregarEstoqueProdutos();
    
    // Atualizar a cada 5 segundos
    autoUpdateInterval = setInterval(() => {
        const secEstoque = document.getElementById('sec-estoque');
        if (!secEstoque || secEstoque.style.display === 'none') return;

        const painelProdutos = document.getElementById('painel-produtos');
        const painelMateriais = document.getElementById('painel-materiais');

        if (painelProdutos && painelProdutos.style.display !== 'none') {
            carregarEstoqueProdutos();
        }
        if (painelMateriais && painelMateriais.style.display !== 'none' && typeof atualizarInterface === 'function') {
            atualizarInterface();
        }
    }, 5000);
    
    console.log('Atualização automática iniciada (5 segundos)');
}

function pararAtualizacaoAutomatica() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        console.log('Atualização automática parada');
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
    
    // Iniciar atualização automática
    iniciarAtualizacaoAutomatica();
});
