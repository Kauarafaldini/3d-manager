// ==========================================
// MÓDULO DE ESTOQUE DE PRODUTOS
// ==========================================

let estoqueProdutosCache = [];
let produtoSelecionadoTerminal = null;

function produtoTemReceita(produto) {
    if (!produto) return false;
    if (produto.temReceita === true) return true;
    return Boolean(
        produto.filamentosUsados?.length > 0 ||
        Number(produto.tempo) > 0 ||
        Number(produto.custoProducaoTotal) > 0 ||
        Number(produto.custoProducao) > 0 ||
        (Number(produto.peso) > 0 && Number(produto.precoKg) > 0)
    );
}

function formatarTempoHoras(horas) {
    const h = Math.floor(Number(horas) || 0);
    const m = Math.round(((Number(horas) || 0) - h) * 60);
    return `${h}h ${m}min`;
}

function getSafeModeloModel() {
    if (typeof window.getModeloModel === 'function') return window.getModeloModel();
    if (typeof getModeloModel === 'function') return getModeloModel();
    if (window.dbBridge?.getModeloModel) return window.dbBridge.getModeloModel();
    return null;
}

function getSafeVendaModel() {
    if (typeof window.getVendaModel === 'function') return window.getVendaModel();
    if (typeof getVendaModel === 'function') return getVendaModel();
    if (window.dbBridge?.getVendaModel) return window.dbBridge.getVendaModel();
    return null;
}

function getSafeEstoqueModel() {
    if (typeof window.getEstoqueModel === 'function') return window.getEstoqueModel();
    if (typeof getEstoqueModel === 'function') return getEstoqueModel();
    if (window.dbBridge?.getEstoqueModel) return window.dbBridge.getEstoqueModel();
    return null;
}

function getEstoqueProdutoModel() {
    return getSafeModeloModel();
}

function irParaPreVendas() {
    if (typeof nav === 'function') {
        const btn = document.querySelector('.nav-item[data-nav=terminal]');
        nav('terminal', btn);
        if (typeof subNavTerminal === 'function') {
            subNavTerminal('pre-vendas');
        }
    }
}
window.irParaPreVendas = irParaPreVendas;

async function carregarEstoqueProdutos() {
    try {
        const ModeloModel = getEstoqueProdutoModel();
        if (!ModeloModel) return;

        const modelos = await ModeloModel.find().lean();
        console.log('[estoque-produtos] Modelos recebidos do banco:', modelos.length);
        estoqueProdutosCache = modelos.map(m => ({
            ...m,
            estoque: m.estoque || 0,
            precoVenda: m.venda || 0,
            temReceita: produtoTemReceita(m)
        }));
        window.estoqueProdutosCache = estoqueProdutosCache;
        console.log('[estoque-produtos] Cache atualizado com', estoqueProdutosCache.length, 'produtos');

        renderizarListaEstoqueProdutos();
        atualizarResumoEstoqueProdutos();
        atualizarSelectProducao();
        if (typeof atualizarSelectProdutosCalculadora === 'function') {
            atualizarSelectProdutosCalculadora();
        }
    } catch (err) {
        console.error('Erro ao carregar estoque de produtos:', err);
    }
}

async function atualizarEstoqueProduto(modeloId, quantidade, tipo) {
    const ModeloModel = getEstoqueProdutoModel();
    if (!ModeloModel) return;

    const produto = await ModeloModel.findById(modeloId);
    if (!produto) return;

    const estoqueAtual = produto.estoque || 0;
    const novoEstoque = tipo === 'entrada'
        ? estoqueAtual + quantidade
        : Math.max(0, estoqueAtual - quantidade);

    await ModeloModel.findByIdAndUpdate(modeloId, { estoque: novoEstoque });

    const cacheIndex = estoqueProdutosCache.findIndex(p => p._id.toString() === modeloId.toString());
    if (cacheIndex !== -1) {
        estoqueProdutosCache[cacheIndex].estoque = novoEstoque;
    }

    return novoEstoque;
}

function limparFormProduto() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('prodEditId', '');
    set('prodCadNome', '');
    set('prodCadSKU', '');
    set('prodCadPreco', '');
    set('prodCadEstoque', '0');
}

async function salvarProdutoEstoque() {
    if (typeof bancoOnline === 'function' && !bancoOnline()) {
        return alert('Servidor offline.');
    }

    const editId = document.getElementById('prodEditId')?.value || '';
    const nome = document.getElementById('prodCadNome')?.value?.trim();
    const sku = document.getElementById('prodCadSKU')?.value?.trim() || '';
    const preco = parseFloat(document.getElementById('prodCadPreco')?.value) || 0;
    const estoque = Math.max(0, parseInt(document.getElementById('prodCadEstoque')?.value, 10) || 0);

    if (!nome) return alert('Informe o nome do produto.');

    const duplicado = estoqueProdutosCache.find(p => {
        if (editId && p._id.toString() === editId) return false;
        const mesmoNome = p.nome && p.nome.toLowerCase() === nome.toLowerCase();
        const mesmoSku = sku && p.sku && p.sku.toLowerCase() === sku.toLowerCase();
        return mesmoNome || mesmoSku;
    });
    if (duplicado) {
        return alert('Já existe um produto com este nome ou SKU.');
    }

    const ModeloModel = getEstoqueProdutoModel();
    if (!ModeloModel) return;

    try {
        if (editId) {
            const atual = estoqueProdutosCache.find(p => p._id.toString() === editId);
            await ModeloModel.findByIdAndUpdate(editId, {
                nome,
                sku,
                venda: preco,
                estoque
            });
            if (typeof mostrarToast === 'function') {
                mostrarToast('Produto atualizado.');
            }
        } else {
            const novo = new ModeloModel({
                nome,
                sku,
                venda: preco,
                estoque,
                temReceita: false,
                quantidadeChapa: 1
            });
            await novo.save();
            if (typeof mostrarToast === 'function') {
                mostrarToast('Produto cadastrado no estoque.');
            }
        }

        limparFormProduto();
        await carregarEstoqueProdutos();
        if (typeof carregarListaModelos === 'function') await carregarListaModelos();
    } catch (err) {
        alert('Erro ao salvar produto: ' + err.message);
    }
}

function editarProdutoEstoque(id) {
    const produto = estoqueProdutosCache.find(p => p._id.toString() === id);
    if (!produto) return;

    document.getElementById('prodEditId').value = id;
    document.getElementById('prodCadNome').value = produto.nome || '';
    document.getElementById('prodCadSKU').value = produto.sku || '';
    document.getElementById('prodCadPreco').value = produto.precoVenda || produto.venda || 0;
    document.getElementById('prodCadEstoque').value = produto.estoque || 0;
    document.getElementById('prodCadNome')?.focus();
}

async function excluirProdutoEstoque(id) {
    const produto = estoqueProdutosCache.find(p => p._id.toString() === id);
    if (!produto) return;
    if (!confirm(`Excluir o produto "${produto.nome}"? Esta ação não pode ser desfeita.`)) return;

    const ModeloModel = getEstoqueProdutoModel();
    if (!ModeloModel) return;

    try {
        await ModeloModel.findByIdAndDelete(id);
        if (typeof mostrarToast === 'function') mostrarToast('Produto excluído.');
        limparFormProduto();
        await carregarEstoqueProdutos();
        if (typeof carregarListaModelos === 'function') await carregarListaModelos();
    } catch (err) {
        alert('Erro ao excluir produto: ' + err.message);
    }
}

function abrirReceitaProduto(id) {
    const produto = estoqueProdutosCache.find(p => p._id.toString() === id);
    if (!produto) return;

    if (typeof nav === 'function') {
        const btnCalc = document.querySelector('.bottom-nav .nav-item[onclick*="calculadora"]');
        nav('calculadora', btnCalc);
    }

    if (typeof definirVinculoProdutoReceita === 'function') {
        definirVinculoProdutoReceita(id);
    } else {
        const selectProduto = document.getElementById('pProdutoEstoqueSelect');
        if (selectProduto) selectProduto.value = id;
        const hiddenVinculo = document.getElementById('pProdutoVinculoId');
        if (hiddenVinculo) hiddenVinculo.value = id;
    }

    if (typeof atualizarSelectProdutosCalculadora === 'function') {
        atualizarSelectProdutosCalculadora();
    }

    if (produtoTemReceita(produto) && typeof carregarModeloPadrao === 'function') {
        const selectReceita = document.getElementById('pModeloSelect');
        if (selectReceita) {
            selectReceita.value = id;
            carregarModeloPadrao();
        }
        return;
    }

    document.getElementById('pNome').value = produto.nome || '';
    document.getElementById('pSKU').value = produto.sku || '';
    document.getElementById('pVenda').value = produto.precoVenda || produto.venda || 0;
    document.getElementById('pModeloSelect').value = '';
    const btnExcluir = document.getElementById('btnExcluirModelo');
    if (btnExcluir) btnExcluir.style.display = 'none';
    if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
}

function renderizarListaEstoqueProdutos(filtro = '') {
    const tbody = document.getElementById('lista-estoque-produtos');
    const emptyMsg = document.getElementById('estoqueListaVazia');
    console.log('[renderizarListaEstoqueProdutos] tbody encontrado:', !!tbody);
    console.log('[renderizarListaEstoqueProdutos] Cache tamanho:', estoqueProdutosCache.length);
    if (!tbody) return;

    const termo = filtro.toLowerCase();
    const produtosFiltrados = estoqueProdutosCache.filter(p => {
        if (!termo) return true;
        return (p.nome && p.nome.toLowerCase().includes(termo)) ||
            (p.sku && p.sku.toLowerCase().includes(termo));
    });
    console.log('[renderizarListaEstoqueProdutos] Produtos filtrados:', produtosFiltrados.length);

    if (!produtosFiltrados.length) {
        tbody.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'block';
        atualizarResumoEstoqueProdutos([]);
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';

    tbody.innerHTML = produtosFiltrados.map(p => {
        const estoque = Number(p.estoque) || 0;
        const qtdClass = estoque <= 0 ? 'zero' : (estoque <= 3 ? 'baixo' : '');
        const temReceita = produtoTemReceita(p);
        const receitaBtn = temReceita
            ? `<button type="button" class="btn-icon-action primary" onclick="abrirReceitaProduto('${p._id}')">Ver receita</button>`
            : `<button type="button" class="btn-icon-action primary" onclick="abrirReceitaProduto('${p._id}')">Criar receita</button>`;

        return `
            <tr>
                <td>
                    <span class="estoque-prod-nome">${p.nome || '—'}</span>
                    <span class="estoque-prod-meta">${temReceita ? 'Com ficha de produção' : 'Somente cadastro'}</span>
                </td>
                <td>${p.sku || '—'}</td>
                <td><span class="estoque-qtd ${qtdClass}">${estoque}</span></td>
                <td>R$ ${(Number(p.precoVenda) || 0).toFixed(2)}</td>
                <td>
                    <span class="badge-receita ${temReceita ? 'sim' : 'nao'}">${temReceita ? 'Sim' : 'Não'}</span>
                </td>
                <td>
                    <div class="estoque-actions">
                        <button type="button" class="btn-icon-action" onclick="editarProdutoEstoque('${p._id}')">Editar</button>
                        ${receitaBtn}
                        <button type="button" class="btn-icon-action danger" onclick="excluirProdutoEstoque('${p._id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    console.log('[renderizarListaEstoqueProdutos] Renderização concluída');
    atualizarResumoEstoqueProdutos(produtosFiltrados);
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
    const filtro = document.getElementById('estoqueBusca')?.value || '';
    renderizarListaEstoqueProdutos(filtro);
}

function atualizarSelectProducao() {
    const select = document.getElementById('prodSelectProducao');
    if (!select) return;

    const comReceita = estoqueProdutosCache.filter(p => produtoTemReceita(p));
    select.innerHTML = '<option value="">Selecione um produto com receita</option>' +
        comReceita.map(p => `
            <option value="${p._id}">${p.nome}${p.sku ? ` (${p.sku})` : ''}</option>
        `).join('');
}

function atualizarInfoProducao() {
    const select = document.getElementById('prodSelectProducao');
    const modeloId = select?.value;
    const quantidade = parseInt(document.getElementById('prodQuantidade')?.value, 10) || 1;
    const produto = estoqueProdutosCache.find(p => p._id.toString() === modeloId);

    const estoqueAtual = produto ? (produto.estoque || 0) : 0;
    const quantidadeChapa = produto ? (produto.quantidadeChapa || 1) : 1;
    const quantidadeTotal = quantidade * quantidadeChapa;
    const estoqueNovo = estoqueAtual + quantidadeTotal;

    const elAtual = document.getElementById('prodEstoqueAtual');
    const elNovo = document.getElementById('prodEstoqueNovo');
    if (elAtual) elAtual.textContent = estoqueAtual;
    if (elNovo) elNovo.textContent = estoqueNovo;

    const infoDiv = document.getElementById('prodInfoAdicional');
    if (!infoDiv) return;

    if (!produto) {
        infoDiv.innerHTML = '';
        return;
    }

    infoDiv.innerHTML = `
        <strong>${produto.nome}</strong><br>
        Tempo por chapa: ${formatarTempoHoras(produto.tempo || 0)} ·
        ${quantidadeChapa} un./chapa ·
        Custo/chapa: R$ ${(Number(produto.custoProducaoTotal) || 0).toFixed(2)}<br>
        Total desta produção: <strong>${quantidadeTotal} un.</strong>
    `;
}

async function registrarProducao() {
    const select = document.getElementById('prodSelectProducao');
    const modeloId = select?.value;
    const quantidadeProducoes = parseInt(document.getElementById('prodQuantidade')?.value, 10) || 1;
    const lote = document.getElementById('prodLote')?.value || '';

    if (!modeloId) return alert('Selecione um produto com receita cadastrada.');
    if (quantidadeProducoes <= 0) return alert('Quantidade deve ser maior que zero.');

    const produto = estoqueProdutosCache.find(p => p._id.toString() === modeloId);
    if (!produto) return alert('Produto não encontrado.');
    if (!produtoTemReceita(produto)) return alert('Este produto não possui receita. Cadastre na Calculadora primeiro.');

    try {
        const quantidadeChapa = produto.quantidadeChapa || 1;
        const quantidadeTotal = quantidadeProducoes * quantidadeChapa;

        await atualizarEstoqueProduto(modeloId, quantidadeTotal, 'entrada');

        const EstoqueModel = getSafeEstoqueModel();
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
            if (typeof atualizarInterface === 'function') await atualizarInterface();
        }

        const VendaModel = getSafeVendaModel();
        if (VendaModel) {
            const custoProducaoTotal = produto.custoProducaoTotal || 0;
            const custoTotalProducao = custoProducaoTotal * quantidadeProducoes;

            const novaProducao = new VendaModel({
                nome: produto.nome,
                sku: produto.sku,
                lucro: -custoTotalProducao,
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
                    quantidadeChapa
                },
                tipo: 'producao'
            });
            await novaProducao.save();
        }

        if (typeof mostrarToast === 'function') {
            mostrarToast(`Produção registrada: +${quantidadeTotal} un.`);
        }

        document.getElementById('prodQuantidade').value = 1;
        document.getElementById('prodLote').value = '';
        select.value = '';
        atualizarInfoProducao();
        await carregarEstoqueProdutos();
    } catch (err) {
        alert('Erro ao registrar produção: ' + err.message);
    }
}

// ==========================================
// TERMINAL DE VENDAS
// ==========================================

function renderizarResultadosTerminal(resultados) {
    const container = document.getElementById('termResultadoBusca');
    if (!container) return;

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
                    ${produtoTemReceita(p) ? '' : ' · <em style="color:#94a3b8;">sem receita</em>'}
                </small>
            </div>
            <div class="item-actions">
                <span class="badge-status ${p.estoque > 0 ? 'ativo' : 'inativo'}">${p.estoque || 0}</span>
            </div>
        </div>
    `).join('');
}

function buscarProdutoTerminal() {
    const termo = document.getElementById('termBuscaProduto').value.toLowerCase().trim();

    if (!termo) {
        renderizarResultadosTerminal(estoqueProdutosCache);
        return;
    }

    const resultados = estoqueProdutosCache.filter(p =>
        (p.nome && p.nome.toLowerCase().includes(termo)) ||
        (p.sku && p.sku.toLowerCase().includes(termo))
    );

    renderizarResultadosTerminal(resultados);
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

    const formVenda = document.getElementById('termFormVenda');
    if (formVenda) formVenda.style.display = 'block';

    atualizarTotalVenda();
}

function atualizarTotalVenda() {
    if (!produtoSelecionadoTerminal) return;
    const quantidade = parseInt(document.getElementById('termQuantidade')?.value, 10) || 1;
    const preco = produtoSelecionadoTerminal.precoVenda || 0;
    const total = quantidade * preco;
    const el = document.getElementById('termTotalVenda');
    if (el) el.textContent = `R$ ${total.toFixed(2)}`;
}

function limparTerminal() {
    produtoSelecionadoTerminal = null;
    document.getElementById('termBuscaProduto').value = '';
    const formVenda = document.getElementById('termFormVenda');
    if (formVenda) formVenda.style.display = 'none';
    document.getElementById('termQuantidade').value = 1;
    document.getElementById('termCanal').value = 'direta';
    document.getElementById('termPedidoId').value = '';
    renderizarResultadosTerminal(estoqueProdutosCache);
}

async function efetuarVendaTerminal() {
    if (!produtoSelecionadoTerminal) return alert('Selecione um produto.');

    const quantidade = parseInt(document.getElementById('termQuantidade')?.value, 10) || 1;
    const canal = document.getElementById('termCanal').value;
    const pedidoId = document.getElementById('termPedidoId').value;
    const estoqueAtual = produtoSelecionadoTerminal.estoque || 0;

    if (quantidade > estoqueAtual) {
        return alert(`Estoque insuficiente. Disponível: ${estoqueAtual}, solicitado: ${quantidade}`);
    }

    try {
        await atualizarEstoqueProduto(produtoSelecionadoTerminal._id, quantidade, 'saida');

        const VendaModel = getSafeVendaModel();
        if (VendaModel) {
            const precoUnitario = produtoSelecionadoTerminal.precoVenda || 0;
            const valorTotal = quantidade * precoUnitario;

            // Calcular taxas de marketplace para descontar do lucro
            let taxaComissao = 0;
            let taxaFixa = 0;
            if (canal === 'shopee' && typeof resolverTaxasShopee === 'function') {
                const cfg = typeof obterConfigShopee === 'function' ? obterConfigShopee() : {};
                const t = resolverTaxasShopee(precoUnitario, cfg);
                taxaComissao = t.valorComissao * quantidade;
                taxaFixa = t.taxaFixa * quantidade;
            } else if (canal === 'ml' && typeof resolverTaxasML === 'function') {
                const cfg = typeof obterConfigML === 'function' ? obterConfigML() : {};
                const t = resolverTaxasML(precoUnitario, cfg);
                taxaComissao = t.valorComissao * quantidade;
                taxaFixa = t.taxaFixa * quantidade;
            }

            const custoTotal = (produtoSelecionadoTerminal.custoProducao || 0) * quantidade;
            const lucroReal = valorTotal - taxaComissao - taxaFixa;

            const novaVenda = new VendaModel({
                nome: produtoSelecionadoTerminal.nome,
                sku: produtoSelecionadoTerminal.sku,
                lucro: lucroReal,
                bruto: valorTotal,
                custo: custoTotal,
                canal,
                quantidade,
                pedidoId,
                detalheCustos: {
                    material: produtoSelecionadoTerminal.custoMat || 0,
                    energia: produtoSelecionadoTerminal.custoEnergia || 0,
                    maquina: produtoSelecionadoTerminal.custoMaquina || 0,
                    trabalho: produtoSelecionadoTerminal.custoTrabalho || 0,
                    desgaste: produtoSelecionadoTerminal.custoDesgaste || 0,
                    embalagem: produtoSelecionadoTerminal.embalagem || 0,
                    extras: produtoSelecionadoTerminal.custoExtras || 0,
                    tempoHoras: produtoSelecionadoTerminal.tempo || 0
                },
                taxas: { comissao: taxaComissao, fixa: taxaFixa },
                status: 'concluida'
            });
            await novaVenda.save();
        }

        if (typeof mostrarToast === 'function') {
            mostrarToast(`Venda registrada: -${quantidade} un.`);
        }

        limparTerminal();
        await carregarEstoqueProdutos();
        renderizarUltimasVendas();
    } catch (err) {
        alert('Erro ao efetuar venda: ' + err.message);
    }
}

async function renderizarUltimasVendas(filtro = '') {
    const container = document.getElementById('termUltimasVendasPanel');
    if (!container) return;

    try {
        const VendaModel = getSafeVendaModel();
        if (!VendaModel) return;

        const vendas = await VendaModel.find().sort({ data: -1 }).lean();
        const vendasSemPre = vendas.filter(v => v.status !== 'pre_venda');
        const termo = filtro.trim().toLowerCase();
        const vendasFiltradas = termo ? vendasSemPre.filter(v => {
            const texto = `${v.nome || ''} ${v.sku || ''} ${v.canal || ''} ${v.pedidoId || ''}`.toLowerCase();
            return texto.includes(termo);
        }) : vendasSemPre;

        const hoje = new Date();
        const vendasConcluidas = vendas.filter(v => v.status !== 'pre_venda' && v.canal !== 'producao' && v.tipo !== 'producao');
        const vendasHoje = vendasConcluidas.filter(v => new Date(v.data).toDateString() === hoje.toDateString());
        const totalDia = vendasHoje.reduce((sum, v) => sum + (Number(v.bruto) || 0), 0);
        const qtdeVendida = vendasHoje.reduce((sum, v) => sum + (Number(v.quantidade) || 1), 0);
        const ticketMedio = vendasHoje.length ? totalDia / vendasHoje.length : 0;

        const elVendasHoje = document.getElementById('termVendasHoje');
        if (elVendasHoje) elVendasHoje.textContent = vendasHoje.length;

        const elTotalDia = document.getElementById('termTotalDia');
        if (elTotalDia) elTotalDia.textContent = `R$ ${totalDia.toFixed(2)}`;

        const elTicketMedio = document.getElementById('termTicketMedio');
        if (elTicketMedio) elTicketMedio.textContent = `R$ ${ticketMedio.toFixed(2)}`;

        const elProdutosVendidos = document.getElementById('termProdutosVendidos');
        if (elProdutosVendidos) elProdutosVendidos.textContent = qtdeVendida;

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
    const preVendasView = document.getElementById('termPreVendasView');
    const filaView = document.getElementById('termFilaView');
    const buttons = document.querySelectorAll('.term-nav-btn');
    if (!saleView || !historyView) return;

    buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));

    saleView.style.display = 'none';
    historyView.style.display = 'none';
    if (preVendasView) preVendasView.style.display = 'none';
    if (filaView) filaView.style.display = 'none';

    if (view === 'movimentacoes') {
        historyView.style.display = 'block';
        renderizarUltimasVendas(document.getElementById('termMovimentoBuscaPanel')?.value || '');
    } else if (view === 'pre-vendas') {
        if (preVendasView) preVendasView.style.display = 'block';
        if (typeof renderizarPreVendas === 'function') renderizarPreVendas();
    } else if (view === 'fila') {
        if (filaView) filaView.style.display = 'block';
        if (window.ImpressorasFilaModulo && typeof window.ImpressorasFilaModulo.renderizarPainelFila === 'function') {
            window.ImpressorasFilaModulo.renderizarPainelFila();
        }
    } else {
        saleView.style.display = 'block';
    }
}

async function renderizarPreVendas() {
    const containers = [
        document.getElementById('termListaPreVendas'),
        document.getElementById('listaPreVendasDedicada')
    ].filter(Boolean);

    if (!containers.length) return;

    try {
        const VendaModel = getSafeVendaModel();
        if (!VendaModel) {
            containers.forEach(c => c.innerHTML = '<p class="empty-msg">Carregando banco de dados...</p>');
            return;
        }

        const vendas = await VendaModel.find().sort({ data: -1 }).lean();
        const preVendas = vendas.filter(v => v.status === 'pre_venda');

        if (!preVendas.length) {
            const emptyHtml = '<p class="empty-msg">Nenhum orçamento pendente. Crie pré-vendas na Calculadora de Preços.</p>';
            containers.forEach(c => c.innerHTML = emptyHtml);
            return;
        }

        const listHtml = preVendas.map(v => `
            <div class="item-row" style="border-left-color:#f59e0b;">
                <div class="item-info">
                    <b>${v.nome}</b>
                    <span>${(v.canal || 'direta').toUpperCase()} · R$ ${(v.bruto || 0).toFixed(2)}</span>
                    <small style="color:#64748b;display:block;margin-top:4px;">
                        Criado em ${new Date(v.data).toLocaleString('pt-BR')} · Qtd: ${v.quantidade || 1}
                    </small>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                    <span style="font-weight:700;color:var(--success);font-size:14px;">R$ ${(v.lucro || 0).toFixed(2)}</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                        <button class="btn-secondary" style="padding:6px 10px;font-size:11px;background:rgba(6,182,212,0.15);border-color:var(--primary);color:var(--primary);" onclick="ImpressorasFilaModulo.abrirModalEnfileirarPreVenda('${v._id}')" title="Enviar para a Fila de Impressão">🖨️ Fila</button>
                        <button class="btn-main" style="padding:6px 12px;font-size:11px;margin:0;" onclick="finalizarPreVenda('${v._id}')">Finalizar</button>
                        <button class="btn-delete-row" onclick="excluirPreVenda('${v._id}')" title="Excluir orçamento">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');

        containers.forEach(c => c.innerHTML = listHtml);
    } catch (err) {
        console.error('Erro ao carregar pré-vendas:', err);
        containers.forEach(c => c.innerHTML = '<p class="empty-msg">Erro ao carregar orçamentos.</p>');
    }
}

async function finalizarPreVenda(id) {
    if (!confirm('Finalizar este orçamento como venda concluída?')) return;

    try {
        const VendaModel = getSafeVendaModel();
        if (!VendaModel) return;

        await VendaModel.findByIdAndUpdate(id, { status: 'concluida' });

        // Baixar estoque de filamentos se houver
        const venda = await VendaModel.findById(id);
        if (venda && venda.filamentosUsados && venda.filamentosUsados.length > 0) {
            const EstoqueModel = getSafeEstoqueModel();
            if (EstoqueModel) {
                for (const f of venda.filamentosUsados) {
                    if (!f.estoqueId) continue;
                    const filamento = await EstoqueModel.findById(f.estoqueId);
                    if (filamento) {
                        const novaQtd = Math.max(0, (Number(filamento.gramas) || 0) - (Number(f.peso) || 0));
                        await EstoqueModel.findByIdAndUpdate(f.estoqueId, { gramas: novaQtd });
                    }
                }
            }
        }

        // Baixar custos extras se houver
        if (venda && venda.custosExtras && venda.custosExtras.length > 0 && typeof baixarEstoqueCustosExtras === 'function') {
            await baixarEstoqueCustosExtras(venda.custosExtras);
        }

        if (typeof mostrarToast === 'function') mostrarToast('Venda finalizada com sucesso!');
        renderizarPreVendas();
        if (typeof atualizarInterface === 'function') await atualizarInterface();
        if (typeof atualizarRelatorioFinanceiro === 'function') await atualizarRelatorioFinanceiro();
        if (typeof atualizarOverviewHome === 'function') await atualizarOverviewHome();
        if (typeof carregarEstoqueProdutos === 'function') await carregarEstoqueProdutos();
    } catch (err) {
        alert('Erro ao finalizar pré-venda: ' + err.message);
    }
}

async function excluirPreVenda(id) {
    if (!confirm('Excluir este orçamento?')) return;

    try {
        const VendaModel = getSafeVendaModel();
        if (!VendaModel) return;

        await VendaModel.findByIdAndDelete(id);
        if (typeof mostrarToast === 'function') mostrarToast('Orçamento excluído.');
        renderizarPreVendas();
    } catch (err) {
        alert('Erro ao excluir orçamento: ' + err.message);
    }
}

// Histórico de vendas para o Financeiro
async function renderHistoricoVendasFinanceiro(filtro = '') {
    const container = document.getElementById('fin-lista-historico-vendas');
    if (!container) return;

    try {
        const VendaModel = getSafeVendaModel();
        if (!VendaModel) return;

        const vendas = await VendaModel.find().sort({ data: -1 }).lean();
        const vendasConcluidas = vendas.filter(v => v.status !== 'pre_venda' && v.canal !== 'producao' && v.tipo !== 'producao');
        const termo = filtro.trim().toLowerCase();
        const vendasFiltradas = termo ? vendasConcluidas.filter(v => {
            const texto = `${v.nome || ''} ${v.sku || ''} ${v.canal || ''} ${v.pedidoId || ''}`.toLowerCase();
            return texto.includes(termo);
        }) : vendasConcluidas;

        if (!vendasFiltradas.length) {
            container.innerHTML = '<p class="empty-msg">Nenhuma venda encontrada.</p>';
            return;
        }

        container.innerHTML = vendasFiltradas.map(v => `
            <div class="item-row">
                <div class="item-info">
                    <b>${v.nome}</b>
                    <span>${(v.canal || 'direta').toUpperCase()} · Bruto: R$ ${(v.bruto || 0).toFixed(2)} · Custo: R$ ${(v.custo || 0).toFixed(2)}</span>
                    <small style="color:#64748b;display:block;margin-top:4px;">
                        ${new Date(v.data).toLocaleString('pt-BR')} · ${v.quantidade || 1} un.
                        ${v.pedidoId ? ' · Pedido: ' + v.pedidoId : ''}
                    </small>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="item-val" style="color:var(--success);">+ R$ ${(v.lucro || 0).toFixed(2)}</div>
                    <button class="btn-delete-row" onclick="excluirVenda('${v._id}')" title="Excluir">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar histórico de vendas:', err);
        container.innerHTML = '<p class="empty-msg">Erro ao carregar histórico.</p>';
    }
}

function filtrarHistoricoVendasFinanceiro() {
    renderHistoricoVendasFinanceiro(document.getElementById('finHistoricoBusca')?.value || '');
}

// Auto-calcular parcela quando valor total e num parcelas preenchidos
function autoCalcParcelaEstoque() {
    const valorTotal = parseFloat(document.getElementById('cadPrecoTotalParcelaEstoque')?.value) || 0;
    const numParcelas = parseFloat(document.getElementById('cadNumParcelasEstoque')?.value) || 0;
    const valorMensalEl = document.getElementById('cadValorMensalEstoque');
    const precoTotalEl = document.getElementById('cadPrecoTotalEstoque');

    if (valorTotal > 0 && numParcelas > 0 && valorMensalEl) {
        valorMensalEl.value = (valorTotal / numParcelas).toFixed(2);
    }
    // Also fill the precoTotal field used by calcularCustoUnitario
    if (precoTotalEl) {
        precoTotalEl.value = valorTotal;
    }
}

let autoUpdateInterval = null;

function iniciarAtualizacaoAutomatica() {
    if (autoUpdateInterval) clearInterval(autoUpdateInterval);
    carregarEstoqueProdutos();

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
}

function pararAtualizacaoAutomatica() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
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
    window.salvarProdutoEstoque = salvarProdutoEstoque;
    window.limparFormProduto = limparFormProduto;
    window.editarProdutoEstoque = editarProdutoEstoque;
    window.excluirProdutoEstoque = excluirProdutoEstoque;
    window.abrirReceitaProduto = abrirReceitaProduto;
    window.produtoTemReceita = produtoTemReceita;
    window.renderizarPreVendas = renderizarPreVendas;
    window.finalizarPreVenda = finalizarPreVenda;
    window.excluirPreVenda = excluirPreVenda;
    window.renderHistoricoVendasFinanceiro = renderHistoricoVendasFinanceiro;
    window.filtrarHistoricoVendasFinanceiro = filtrarHistoricoVendasFinanceiro;
    window.autoCalcParcelaEstoque = autoCalcParcelaEstoque;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('termQuantidade')?.addEventListener('input', atualizarTotalVenda);
    document.getElementById('prodQuantidade')?.addEventListener('input', atualizarInfoProducao);
    iniciarAtualizacaoAutomatica();
});
