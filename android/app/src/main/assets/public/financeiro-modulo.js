function getCustoItemModel() {
    return window.dbBridge.getCustoItemModel();
}

let custosCache = [];

const LABEL_CATEGORIA = {
    insumo: 'Insumo / Acessório',
    manutencao: 'Manutenção',
    parcela: 'Parcela / Financiamento',
    embalagem: 'Embalagem',
    ferramenta: 'Ferramenta',
    outro: 'Outro'
};

const LABEL_TIPO = {
    lote: 'Compra em lote (divide o total)',
    unitario_fixo: 'Custo unitário fixo',
    parcela_mensal: 'Parcela mensal',
    por_hora: 'Custo por hora de uso'
};

function formatarMoeda(v) {
    return `R$ ${(v || 0).toFixed(2)}`;
}

function idCusto(item) {
    return item && item._id ? item._id.toString() : '';
}

function calcularCustoUnitario(dados) {
    const tipo = dados.tipoCalculo || 'lote';
    if (tipo === 'lote') {
        const total = parseFloat(dados.precoTotal) || 0;
        const qtd = parseFloat(dados.quantidadeTotal) || 0;
        return qtd > 0 ? total / qtd : 0;
    }
    if (tipo === 'unitario_fixo') return parseFloat(dados.custoUnitario) || 0;
    if (tipo === 'por_hora') return parseFloat(dados.custoPorHora) || 0;
    if (tipo === 'parcela_mensal') {
        const valorTotal = parseFloat(dados.precoTotal) || 0;
        const numParcelas = parseFloat(dados.numParcelas) || 0;
        const valorMensal = parseFloat(dados.valorMensal) || 0;
        // Se tem valor total e num parcelas, calcula o mensal
        if (valorTotal > 0 && numParcelas > 0) {
            return valorTotal / numParcelas;
        }
        // Se tem apenas valor da parcela, usa direto
        return valorMensal;
    }
    return 0;
}

function custoUsavelNaPeca(item) {
    return item && item.ativo !== false && ['lote', 'unitario_fixo', 'por_hora'].includes(item.tipoCalculo);
}

function atualizarFormularioCustoCadastro() {
    const tipo = document.getElementById('cadTipoCalculo').value;
    document.querySelectorAll('.cad-campo-lote').forEach(el => {
        el.style.display = tipo === 'lote' ? 'block' : 'none';
    });
    document.querySelectorAll('.cad-campo-unitario').forEach(el => {
        el.style.display = tipo === 'unitario_fixo' ? 'block' : 'none';
    });
    document.querySelectorAll('.cad-campo-parcela').forEach(el => {
        el.style.display = tipo === 'parcela_mensal' ? 'block' : 'none';
    });
    document.querySelectorAll('.cad-campo-hora').forEach(el => {
        el.style.display = tipo === 'por_hora' ? 'block' : 'none';
    });

    // Garantir que os inputs estejam editáveis
    document.querySelectorAll('#cadPrecoTotal, #cadQtdTotal, #cadCustoUnitario, #cadValorMensal, #cadHorasMes, #cadCustoHora').forEach(el => {
        el.readOnly = false;
        el.disabled = false;
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
    });

    atualizarPreviewCustoCadastro();
}

function atualizarPreviewCustoCadastro() {
    const preview = document.getElementById('cadPreviewUnitario');
    if (!preview) return;

    const tipo = document.getElementById('cadTipoCalculo').value;
    const dados = {
        tipoCalculo: tipo,
        precoTotal: document.getElementById('cadPrecoTotal').value,
        quantidadeTotal: document.getElementById('cadQtdTotal').value,
        custoUnitario: document.getElementById('cadCustoUnitario').value,
        valorMensal: document.getElementById('cadValorMensal').value,
        numParcelas: document.getElementById('cadNumParcelas')?.value || 0,
        custoPorHora: document.getElementById('cadCustoHora').value
    };
    const unidade = document.getElementById('cadUnidade').value || 'un';
    const unit = calcularCustoUnitario(dados);

    if (tipo === 'lote') {
        preview.innerHTML = `Cada <b>${unidade}</b> sai por <b style="color:var(--success)">${formatarMoeda(unit)}</b>`;
    } else if (tipo === 'unitario_fixo') {
        preview.innerHTML = `Custo fixo: <b style="color:var(--success)">${formatarMoeda(unit)}</b> / ${unidade}`;
    } else if (tipo === 'parcela_mensal') {
        const valorTotal = parseFloat(dados.precoTotal) || 0;
        const numParcelas = parseFloat(dados.numParcelas) || 0;
        const valorMensal = parseFloat(dados.valorMensal) || 0;
        if (valorTotal > 0 && numParcelas > 0) {
            const calc = valorTotal / numParcelas;
            preview.innerHTML = `<b>${numParcelas}x</b> de <b style="color:#fbbf24">${formatarMoeda(calc)}</b> = ${formatarMoeda(valorTotal)} total`;
        } else if (valorMensal > 0 && numParcelas > 0) {
            const total = valorMensal * numParcelas;
            preview.innerHTML = `<b>${numParcelas}x</b> de <b style="color:#fbbf24">${formatarMoeda(valorMensal)}</b> = ${formatarMoeda(total)} total`;
        } else if (valorMensal > 0) {
            preview.innerHTML = `Parcela fixa: <b style="color:#fbbf24">${formatarMoeda(valorMensal)}/mês</b>`;
        } else {
            preview.innerHTML = 'Preencha o valor total e nº de parcelas, ou valor da parcela.';
        }
    } else if (tipo === 'por_hora') {
        preview.innerHTML = `Custo operacional: <b style="color:var(--success)">${formatarMoeda(unit)}/hora</b>`;
    }
}

async function carregarCustos() {
    try {
        const Model = getCustoItemModel();
        custosCache = await Model.find({ ativo: { $ne: false } }).sort({ nome: 1 });
        renderListaCustosCadastro();
        if (typeof renderListaCustosCadastroEstoque === 'function') renderListaCustosCadastroEstoque();
        atualizarTodosSelectsCustoExtra();
    } catch (e) {
        console.error('Erro ao carregar custos:', e);
    }
}

async function salvarCustoItem() {
    if (typeof mongoose !== 'undefined' && mongoose.connection.readyState !== 1) {
        return alert('Servidor offline.');
    }

    const nome = document.getElementById('cadNome').value.trim();
    if (!nome) return alert('Informe o nome do custo.');

    const tipoCalculo = document.getElementById('cadTipoCalculo').value;
    const categoria = document.getElementById('cadCategoria').value;
    const unidade = document.getElementById('cadUnidade').value.trim() || 'un';
    const observacao = document.getElementById('cadObs').value.trim();

    const payload = {
        nome,
        categoria,
        tipoCalculo,
        unidade,
        observacao,
        ativo: true,
        precoTotal: parseFloat(document.getElementById('cadPrecoTotal').value) || 0,
        quantidadeTotal: parseFloat(document.getElementById('cadQtdTotal').value) || 0,
        custoUnitario: parseFloat(document.getElementById('cadCustoUnitario').value) || 0,
        valorMensal: parseFloat(document.getElementById('cadValorMensal').value) || 0,
        horasUsoMes: parseFloat(document.getElementById('cadHorasMes').value) || 160,
        custoPorHora: parseFloat(document.getElementById('cadCustoHora').value) || 0
    };

    payload.custoUnitario = calcularCustoUnitario(payload);

    if (tipoCalculo === 'lote') {
        if (payload.quantidadeTotal <= 0) return alert('Informe a quantidade do lote.');
        if (payload.precoTotal <= 0) return alert('Informe o preço total pago.');
        payload.estoqueAtual = payload.quantidadeTotal;
    }

    try {
        const Model = getCustoItemModel();
        await Model.create(payload);
        await carregarCustos();
        if (typeof atualizarRelatorioFinanceiro === 'function') atualizarRelatorioFinanceiro();
        if (typeof aposOperacaoSalvar === 'function') {
            await aposOperacaoSalvar({
                mensagem: 'Custo cadastrado!',
                resetFn: resetFormularioCustoCadastro,
                foco: '#cadNome',
                atualizar: false
            });
        }
    } catch (err) {
        alert('Erro ao salvar custo: ' + err.message);
        if (typeof reativarFormularios === 'function') reativarFormularios('#cadNome');
    }
}

async function excluirCustoItem(id) {
    if (!confirm('Excluir este custo do cadastro?')) return;
    try {
        const Model = getCustoItemModel();
        await Model.findByIdAndDelete(id);
        await carregarCustos();
        if (typeof atualizarRelatorioFinanceiro === 'function') atualizarRelatorioFinanceiro();
    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
    }
}

function renderListaCustosCadastro() {
    const lista = document.getElementById('lista-custos-cadastro');
    if (!lista) return;

    const filtro = (document.getElementById('filtroCategoriaCustos') || {}).value || '';

    const itens = custosCache.filter(c => !filtro || c.categoria === filtro);

    if (itens.length === 0) {
        lista.innerHTML = '<p class="empty-msg">Nenhum custo cadastrado nesta categoria.</p>';
        return;
    }

    lista.innerHTML = itens.map(c => {
        const unit = c.custoUnitario || calcularCustoUnitario(c);
        let detalhe = '';
        if (c.tipoCalculo === 'lote') {
            detalhe = `${formatarMoeda(c.precoTotal)} ÷ ${c.quantidadeTotal} ${c.unidade} | Estoque: ${c.estoqueAtual ?? c.quantidadeTotal}`;
        } else if (c.tipoCalculo === 'parcela_mensal') {
            const numP = c.numParcelas || 0;
            if (numP > 0) {
                detalhe = `${numP}x de ${formatarMoeda(unit)} = ${formatarMoeda(unit * numP)} total`;
            } else {
                detalhe = `${formatarMoeda(unit)}/mês`;
            }
        } else if (c.tipoCalculo === 'por_hora') {
            detalhe = `${formatarMoeda(unit)}/hora`;
        } else {
            detalhe = `${formatarMoeda(unit)}/${c.unidade}`;
        }

        return `
            <div class="item-row" style="border-left-color: #8b5cf6">
                <div class="item-info">
                    <b>${c.nome}</b>
                    <span>${LABEL_CATEGORIA[c.categoria] || c.categoria} · ${LABEL_TIPO[c.tipoCalculo] || c.tipoCalculo}</span>
                    <span style="display:block;margin-top:4px;color:#94a3b8;">${detalhe}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="item-val" style="color:#c4b5fd">${formatarMoeda(unit)}</div>
                    <button class="btn-delete-row" onclick="excluirCustoItem('${idCusto(c)}')" title="Excluir">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function subNavControle(painel) {
    document.querySelectorAll('#sec-financeiro .controle-subtab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#sec-financeiro .controle-painel').forEach(p => p.style.display = 'none');

    const btn = document.querySelector(`#sec-financeiro .controle-subtab[data-painel="${painel}"]`);
    if (btn) btn.classList.add('active');
    const el = document.getElementById(`painel-${painel}`);
    if (el) el.style.display = 'block';

    if (painel === 'relatorio') {
        atualizarRelatorioFinanceiro();
        carregarCustos();
    } else if (painel === 'historico-vendas') {
        if (typeof renderHistoricoVendasFinanceiro === 'function') renderHistoricoVendasFinanceiro();
    } else if (painel === 'parcelas') {
        // Renderizar lista de parcelas no painel separado
        atualizarRelatorioFinanceiro();
    } else if (painel === 'insumos') {
        // Renderizar catálogo de insumos no painel separado
        carregarCustos();
    }
}



function filtrarVendasPorPeriodo(vendas, filtro) {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth();

    if (filtro === 'todos') return vendas;

    if (filtro === 'mes_atual') {
        return vendas.filter(v => {
            const d = new Date(v.data);
            return d.getFullYear() === ano && d.getMonth() === mes;
        });
    }

    if (filtro === 'mes_anterior') {
        const dRef = new Date(ano, mes - 1, 1);
        return vendas.filter(v => {
            const d = new Date(v.data);
            return d.getFullYear() === dRef.getFullYear() && d.getMonth() === dRef.getMonth();
        });
    }

    if (filtro === 'ano_atual') {
        return vendas.filter(v => new Date(v.data).getFullYear() === ano);
    }

    if (filtro === 'personalizado') {
        const startEl = document.getElementById('relDataInicio');
        const endEl = document.getElementById('relDataFim');
        const startStr = startEl ? startEl.value : '';
        const endStr = endEl ? endEl.value : '';
        if (!startStr && !endStr) return vendas;
        const inicio = startStr ? new Date(startStr + 'T00:00:00') : null;
        const fim = endStr ? new Date(endStr + 'T23:59:59') : null;
        return vendas.filter(v => {
            const d = new Date(v.data);
            if (inicio && d < inicio) return false;
            if (fim && d > fim) return false;
            return true;
        });
    }

    return vendas;
}

function atualizarFiltroPeriodo() {
    const filtro = document.getElementById('relFiltro')?.value;
    const periodoPersonalizado = document.getElementById('relPeriodoPersonalizado');
    if (periodoPersonalizado) {
        periodoPersonalizado.style.display = filtro === 'personalizado' ? 'flex' : 'none';
    }
}

function agregarMetricasVendas(vendas) {
    const m = {
        mat: 0, energia: 0, maquina: 0, trabalho: 0, desgaste: 0, emb: 0, extras: 0,
        comissao: 0, fixa: 0, bruto: 0, lucro: 0, custo: 0, qtd: vendas.length
    };

    vendas.forEach(v => {
        m.bruto += v.bruto || 0;
        m.lucro += v.lucro || 0;
        m.custo += v.custo || 0;

        if (v.detalheCustos) {
            m.mat += v.detalheCustos.material || 0;
            m.energia += v.detalheCustos.energia || 0;
            m.maquina += v.detalheCustos.maquina || 0;
            m.trabalho += v.detalheCustos.trabalho || 0;
            m.desgaste += v.detalheCustos.desgaste || 0;
            m.emb += v.detalheCustos.embalagem || 0;
            m.extras += v.detalheCustos.extras || 0;
        } else {
            m.mat += v.custo || 0;
        }

        if (v.taxas) {
            m.comissao += v.taxas.comissao || 0;
            m.fixa += v.taxas.fixa || 0;
        }
    });

    return m;
}

function coletarCustosExtrasLinhas() {
    const itens = [];
    let total = 0;

    document.querySelectorAll('.linha-custo-extra').forEach(linha => {
        const select = linha.querySelector('.cSelect');
        const qtdInput = linha.querySelector('.cQtd');
        const subEl = linha.querySelector('.cSubtotal');

        const qtd = parseFloat(qtdInput.value) || 0;
        const custoItemId = select.value;
        if (!custoItemId || qtd <= 0) return;

        const item = custosCache.find(c => idCusto(c) === custoItemId);
        if (!item) return;

        const custoUnitario = item.custoUnitario || calcularCustoUnitario(item);
        const subtotal = custoUnitario * qtd;
        total += subtotal;

        if (subEl) subEl.textContent = formatarMoeda(subtotal);

        itens.push({
            custoItemId,
            nome: item.nome,
            quantidade: qtd,
            custoUnitario,
            subtotal
        });
    });

    return { total, itens };
}

function adicionarLinhaCustoExtra(dados = null) {
    const container = document.getElementById('container-custos-extras-linhas');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'linha-custo-extra';

    let opts = '<option value="">-- Selecione um custo cadastrado --</option>';
    custosCache.filter(c => custoUsavelNaPeca(c)).forEach(c => {
        const unit = c.custoUnitario || calcularCustoUnitario(c);
        opts += `<option value="${idCusto(c)}">${c.nome} (${formatarMoeda(unit)}/${c.unidade})</option>`;
    });

    row.innerHTML = `
        <select class="cSelect" onchange="atualizarSubtotalLinhaCusto(this)" style="flex:2;">${opts}</select>
        <input type="number" class="cQtd" step="0.01" min="0" placeholder="Qtd" style="flex:1;" oninput="atualizarSubtotalLinhaCusto(this)" value="${dados && dados.quantidade != null ? dados.quantidade : '1'}">
        <span class="cSubtotal" style="flex:1;color:var(--success);font-size:12px;font-weight:bold;">R$ 0,00</span>
        <button type="button" class="btn-delete-row" onclick="removerLinhaCustoExtra(this)">✕</button>
    `;

    container.appendChild(row);

    if (dados && dados.custoItemId) {
        row.querySelector('.cSelect').value = dados.custoItemId;
    }

    if (typeof liberarInput === 'function') {
        row.querySelectorAll('input, select').forEach(liberarInput);
    }

    atualizarSubtotalLinhaCusto(row.querySelector('.cSelect'));
    if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
}

function atualizarSubtotalLinhaCusto(el) {
    const row = el.closest('.linha-custo-extra');
    const select = row.querySelector('.cSelect');
    const qtd = parseFloat(row.querySelector('.cQtd').value) || 0;
    const subEl = row.querySelector('.cSubtotal');
    const item = custosCache.find(c => idCusto(c) === select.value);

    if (item && subEl) {
        const unit = item.custoUnitario || calcularCustoUnitario(item);
        subEl.textContent = formatarMoeda(unit * qtd);
    } else if (subEl) {
        subEl.textContent = 'R$ 0,00';
    }

    if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
}

function removerLinhaCustoExtra(btn) {
    btn.closest('.linha-custo-extra').remove();
    if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
}

function atualizarTodosSelectsCustoExtra() {
    document.querySelectorAll('.linha-custo-extra').forEach(row => {
        const select = row.querySelector('.cSelect');
        const qtdInput = row.querySelector('.cQtd');
        const val = select.value;
        const qtd = qtdInput.value;

        let opts = '<option value="">-- Selecione um custo cadastrado --</option>';
        custosCache.filter(c => custoUsavelNaPeca(c)).forEach(c => {
            const unit = c.custoUnitario || calcularCustoUnitario(c);
            opts += `<option value="${idCusto(c)}">${c.nome} (${formatarMoeda(unit)}/${c.unidade})</option>`;
        });
        select.innerHTML = opts;
        if (custosCache.some(c => idCusto(c) === val)) select.value = val;
        qtdInput.value = qtd;
        atualizarSubtotalLinhaCusto(select);
    });
}

async function baixarEstoqueCustosExtras(itens) {
    const Model = getCustoItemModel();
    for (const u of itens) {
        if (!u.custoItemId) continue;
        const item = await Model.findById(u.custoItemId);
        if (item && item.tipoCalculo === 'lote' && item.estoqueAtual != null) {
            item.estoqueAtual = Math.max(0, item.estoqueAtual - u.quantidade);
            await item.save();
        }
    }
}

async function atualizarRelatorioFinanceiro() {
    const wrap = document.getElementById('relatorio-conteudo');
    if (!wrap) return;

    try {
        const todasVendas = await window.dbBridge.getVendaModel().find({}).sort({ data: -1 });
        const getEstoqueModel = window.dbBridge.getEstoqueModel;
        const estoque = await getEstoqueModel().find({});
        await carregarCustos();

        const filtro = document.getElementById('relFiltro')?.value || 'mes_atual';
        // Filtrar vendas de produção e pré-vendas
        const vendasReais = todasVendas.filter(v => v.canal !== 'producao' && v.tipo !== 'producao' && v.status !== 'pre_venda');
        const vendasPeriodo = filtrarVendasPorPeriodo(vendasReais, filtro);
        const metricasTotal = agregarMetricasVendas(vendasReais);
        const m = agregarMetricasVendas(vendasPeriodo);

        const valorEstoqueFilamento = estoque.reduce((acc, e) => acc + (e.gramas / 1000) * e.precoKg, 0);
        const pesoEstoque = estoque.reduce((acc, e) => acc + e.gramas, 0);

        const parcelasMensais = custosCache
            .filter(c => c.tipoCalculo === 'parcela_mensal')
            .reduce((acc, c) => acc + (c.valorMensal || 0), 0);

        // Desperdício e Sucata
        let desperdicios = [];
        try {
            const DesperdicioModel = window.dbBridge.getDesperdicioModel ? window.dbBridge.getDesperdicioModel() : null;
            if (DesperdicioModel) {
                const todosDesp = await DesperdicioModel.find({}).sort({ data: -1 });
                desperdicios = filtrarVendasPorPeriodo(todosDesp, filtro);
            }
        } catch (dErr) {
            console.warn('[relatorio] Erro ao carregar desperdícios:', dErr);
        }

        const totalDesperdicioGramas = desperdicios.reduce((acc, d) => acc + (Number(d.gramas) || 0), 0);
        const totalDesperdicioValor = desperdicios.reduce((acc, d) => acc + (Number(d.custoEstimado) || 0), 0);

        const margemPeriodo = m.custo > 0 ? (m.lucro / m.custo) * 100 : 0;
        const custoOperacional = m.mat + m.energia + m.trabalho + m.desgaste + m.emb + m.extras;

        // Ponto de Equilíbrio (Break-Even)
        const custosFixosTotal = parcelasMensais;
        const margemContribucaoPct = m.bruto > 0 ? (m.lucro / m.bruto) : 0.45;
        const faturamentoBreakEven = custosFixosTotal > 0 && margemContribucaoPct > 0
            ? custosFixosTotal / margemContribucaoPct
            : 0;
        const horasBreakEven = custosFixosTotal > 0 ? Math.ceil(custosFixosTotal / 12) : 0;
        const percentualBreakEven = custosFixosTotal > 0
            ? Math.round((m.lucro / custosFixosTotal) * 100)
            : 100;

        const barras = [
            { label: 'Filamento / Material', valor: m.mat, cor: '#3b82f6' },
            { label: 'Energia elétrica', valor: m.energia, cor: '#f59e0b' },
            { label: 'Trabalho (mão de obra)', valor: m.trabalho || 0, cor: '#06b6d4' },
            { label: 'Desgaste impressora', valor: m.desgaste || 0, cor: '#8b5cf6' },
            { label: 'Embalagem', valor: m.emb, cor: '#10b981' },
            { label: 'Insumos cadastrados', valor: m.extras, cor: '#ec4899' },
            { label: 'Taxas marketplace', valor: m.comissao + m.fixa, cor: '#ef4444' }
        ];
        const maxBarra = Math.max(...barras.map(b => b.valor), 1);

        const elLucroMes = document.getElementById('relLucroMes');
        if (elLucroMes) elLucroMes.textContent = formatarMoeda(m.lucro);
        const elLucroTotal = document.getElementById('relLucroTotal');
        if (elLucroTotal) elLucroTotal.textContent = formatarMoeda(metricasTotal.lucro);

        document.getElementById('relBruto').textContent = formatarMoeda(m.bruto);
        document.getElementById('relCustoVendas').textContent = formatarMoeda(m.custo);
        document.getElementById('relMargem').textContent = margemPeriodo.toFixed(1) + '%';
        document.getElementById('relEstoqueValor').textContent = formatarMoeda(valorEstoqueFilamento);
        document.getElementById('relEstoquePeso').textContent = pesoEstoque.toFixed(0) + ' g';
        document.getElementById('relParcelas').textContent = formatarMoeda(parcelasMensais);
        document.getElementById('relNumVendas').textContent = `${m.qtd} no período · ${todasVendas.length} total`;

        // Métricas de Break-Even e Desperdício
        const elBeFat = document.getElementById('relBreakEvenFaturamento');
        if (elBeFat) elBeFat.textContent = formatarMoeda(faturamentoBreakEven);
        const elBeHoras = document.getElementById('relBreakEvenHoras');
        if (elBeHoras) elBeHoras.textContent = `${horasBreakEven}h mín.`;

        const elDespVal = document.getElementById('relDesperdicioValor');
        if (elDespVal) elDespVal.textContent = formatarMoeda(totalDesperdicioValor);
        const elDespPeso = document.getElementById('relDesperdicioPeso');
        if (elDespPeso) elDespPeso.textContent = `${totalDesperdicioGramas.toFixed(0)} g`;

        // Card Break-Even Visual
        const elBeFixos = document.getElementById('beCustosFixosTotal');
        if (elBeFixos) elBeFixos.textContent = formatarMoeda(custosFixosTotal);
        const elBePct = document.getElementById('bePercentualMeta');
        if (elBePct) elBePct.textContent = `${percentualBreakEven}%`;
        const elBeBar = document.getElementById('beProgressBar');
        if (elBeBar) {
            elBeBar.style.width = `${Math.min(100, Math.max(0, percentualBreakEven))}%`;
            if (percentualBreakEven >= 100) {
                elBeBar.style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
            } else {
                elBeBar.style.background = 'linear-gradient(90deg, #06b6d4, #3b82f6)';
            }
        }
        const elBeStatus = document.getElementById('beStatusBadge');
        if (elBeStatus) {
            if (custosFixosTotal <= 0) {
                elBeStatus.className = 'status-pill badge-disponivel';
                elBeStatus.textContent = 'Sem custos fixos';
            } else if (percentualBreakEven >= 100) {
                elBeStatus.className = 'status-pill badge-disponivel';
                elBeStatus.textContent = '✅ Meta Atingida';
            } else {
                elBeStatus.className = 'status-pill badge-manutencao';
                elBeStatus.textContent = `⏳ ${percentualBreakEven}% Coberto`;
            }
        }
        const elBeMsg = document.getElementById('beMensagemDestaque');
        if (elBeMsg) {
            if (custosFixosTotal <= 0) {
                elBeMsg.innerHTML = `💡 Nenhum custo fixo mensal cadastrado em <b>Financeiro → Parcelas</b>. Todo o lucro gerado é lucro líquido direto.`;
            } else if (percentualBreakEven >= 100) {
                const lucroExtra = m.lucro - custosFixosTotal;
                elBeMsg.innerHTML = `🎉 <b>Ponto de equilíbrio superado!</b> 100% dos custos fixos do mês foram pagos. Você já gerou <b style="color:var(--success);">${formatarMoeda(lucroExtra)}</b> de lucro livre adicional.`;
            } else {
                const falta = custosFixosTotal - m.lucro;
                elBeMsg.innerHTML = `Faltam <b style="color:var(--warning);">${formatarMoeda(falta)}</b> de lucro para zerar os custos fixos deste período. Faturamento mínimo estimado: <b>${formatarMoeda(faturamentoBreakEven)}</b>.`;
            }
        }

        const relMaoObra = document.getElementById('relMaoObra');
        if (relMaoObra) relMaoObra.textContent = formatarMoeda(m.trabalho);

        const compCusto = document.getElementById('relComparativoCusto');
        const compLucro = document.getElementById('relComparativoLucro');
        const compTrack = document.getElementById('relComparativoTrack');
        if (compCusto && compLucro && compTrack) {
            const maxComp = Math.max(custoOperacional, m.lucro, 1);
            compCusto.style.width = `${(custoOperacional / maxComp) * 100}%`;
            compLucro.style.width = `${(m.lucro / maxComp) * 100}%`;
            compCusto.textContent = `Custos: ${formatarMoeda(custoOperacional)}`;
            compLucro.textContent = `Lucro: ${formatarMoeda(m.lucro)}`;
        }

        const startVal = document.getElementById('relDataInicio')?.value || '';
        const endVal = document.getElementById('relDataFim')?.value || '';
        const labels = {
            mes_atual: 'Mês atual',
            mes_anterior: 'Mês anterior',
            ano_atual: 'Ano atual',
            todos: 'Todo o histórico',
            personalizado: startVal && endVal ? `${startVal} a ${endVal}` : (startVal || endVal || 'Período personalizado')
        };
        const textoPeriodo = labels[filtro] || filtro;
        const labelPeriodo = document.getElementById('relLabelPeriodo');
        if (labelPeriodo) labelPeriodo.textContent = textoPeriodo;
        const labelPeriodo2 = document.getElementById('relLabelPeriodo2');
        if (labelPeriodo2) labelPeriodo2.textContent = textoPeriodo;

        wrap.innerHTML = barras.map(b => `
            <div class="rel-barra-item">
                <div class="rel-barra-label">
                    <span>${b.label}</span>
                    <b>${formatarMoeda(b.valor)}</b>
                </div>
                <div class="rel-barra-track">
                    <div class="rel-barra-fill" style="width:${(b.valor / maxBarra) * 100}%;background:${b.cor}"></div>
                </div>
            </div>
        `).join('');

        const listaParcelas = document.getElementById('rel-lista-parcelas');
        const parcelasItens = custosCache.filter(c => c.tipoCalculo === 'parcela_mensal');
        if (listaParcelas) {
            listaParcelas.innerHTML = parcelasItens.length
                ? parcelasItens.map(c => `
                    <div class="item-row" style="border-left-color:#f59e0b">
                        <div class="item-info"><b>${c.nome}</b><span>${LABEL_CATEGORIA[c.categoria]}</span></div>
                        <div class="item-val" style="color:#fbbf24">${formatarMoeda(c.valorMensal)}/mês</div>
                    </div>`).join('')
                : '<p class="empty-msg">Nenhuma parcela cadastrada.</p>';
        }

        const listaInsumos = document.getElementById('rel-lista-insumos');
        const insumosItens = custosCache.filter(c => c.tipoCalculo === 'lote' || c.tipoCalculo === 'unitario_fixo');
        if (listaInsumos) {
            listaInsumos.innerHTML = insumosItens.length
                ? insumosItens.map(c => {
                    const unit = c.custoUnitario || calcularCustoUnitario(c);
                    const est = c.estoqueAtual != null ? ` · Estoque: ${c.estoqueAtual} ${c.unidade}` : '';
                    return `
                    <div class="item-row" style="border-left-color:#ec4899">
                        <div class="item-info"><b>${c.nome}</b><span>${formatarMoeda(unit)}/${c.unidade}${est}</span></div>
                    </div>`;
                }).join('')
                : '<p class="empty-msg">Cadastre insumos na aba Cadastro.</p>';
        }

        const hint = document.getElementById('rel-hint-hora');
        if (hint) hint.textContent = `Período: ${m.qtd} venda(s) · Lucro acumulado geral: ${formatarMoeda(metricasTotal.lucro)}`;
    } catch (err) {
        console.error(err);
        wrap.innerHTML = '<p class="empty-msg">Erro ao carregar relatório.</p>';
    }
}

// Funções específicas para o painel de lançamentos no Estoque
function atualizarFormularioCustoCadastroEstoque() {
    const tipo = document.getElementById('cadTipoCalculoEstoque').value;
    document.querySelectorAll('.cad-campo-lote-estoque').forEach(el => {
        el.style.display = tipo === 'lote' ? 'block' : 'none';
    });
    document.querySelectorAll('.cad-campo-unitario-estoque').forEach(el => {
        el.style.display = tipo === 'unitario_fixo' ? 'block' : 'none';
    });
    document.querySelectorAll('.cad-campo-parcela-estoque').forEach(el => {
        el.style.display = tipo === 'parcela_mensal' ? 'block' : 'none';
    });
    document.querySelectorAll('.cad-campo-hora-estoque').forEach(el => {
        el.style.display = tipo === 'por_hora' ? 'block' : 'none';
    });

    document.querySelectorAll('#cadPrecoTotalEstoque, #cadPrecoTotalParcelaEstoque, #cadNumParcelasEstoque, #cadQtdTotalEstoque, #cadCustoUnitarioEstoque, #cadValorMensalEstoque, #cadCustoHoraEstoque').forEach(el => {
        el.readOnly = false;
        el.disabled = false;
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
    });

    atualizarPreviewCustoCadastroEstoque();
}

function atualizarPreviewCustoCadastroEstoque() {
    const preview = document.getElementById('cadPreviewUnitarioEstoque');
    if (!preview) return;

    const tipo = document.getElementById('cadTipoCalculoEstoque').value;
    const dados = {
        tipoCalculo: tipo,
        precoTotal: document.getElementById('cadPrecoTotalEstoque').value,
        quantidadeTotal: document.getElementById('cadQtdTotalEstoque').value,
        custoUnitario: document.getElementById('cadCustoUnitarioEstoque').value,
        valorMensal: document.getElementById('cadValorMensalEstoque').value,
        numParcelas: document.getElementById('cadNumParcelasEstoque')?.value || 0,
        custoPorHora: document.getElementById('cadCustoHoraEstoque').value
    };
    const unidade = document.getElementById('cadUnidadeEstoque').value || 'un';
    const unit = calcularCustoUnitario(dados);

    if (tipo === 'lote') {
        preview.innerHTML = `Cada <b>${unidade}</b> sai por <b style="color:var(--success)">${formatarMoeda(unit)}</b>`;
    } else if (tipo === 'unitario_fixo') {
        preview.innerHTML = `Custo fixo: <b style="color:var(--success)">${formatarMoeda(unit)}</b> / ${unidade}`;
    } else if (tipo === 'parcela_mensal') {
        const valorTotal = parseFloat(dados.precoTotal) || 0;
        const numParcelas = parseFloat(dados.numParcelas) || 0;
        const valorMensal = parseFloat(dados.valorMensal) || 0;
        if (valorTotal > 0 && numParcelas > 0) {
            const calc = valorTotal / numParcelas;
            preview.innerHTML = `<b>${numParcelas}x</b> de <b style="color:#fbbf24">${formatarMoeda(calc)}</b> = ${formatarMoeda(valorTotal)} total`;
        } else if (valorMensal > 0 && numParcelas > 0) {
            const total = valorMensal * numParcelas;
            preview.innerHTML = `<b>${numParcelas}x</b> de <b style="color:#fbbf24">${formatarMoeda(valorMensal)}</b> = ${formatarMoeda(total)} total`;
        } else if (valorMensal > 0) {
            preview.innerHTML = `Parcela fixa: <b style="color:#fbbf24">${formatarMoeda(valorMensal)}/mês</b>`;
        } else {
            preview.innerHTML = 'Preencha o valor total e nº de parcelas, ou valor da parcela.';
        }
    } else if (tipo === 'por_hora') {
        preview.innerHTML = `Custo operacional: <b style="color:var(--success)">${formatarMoeda(unit)}/hora</b>`;
    }
}

async function salvarCustoItemEstoque() {
    if (typeof mongoose !== 'undefined' && mongoose.connection.readyState !== 1) {
        return alert('Servidor offline.');
    }

    const nome = document.getElementById('cadNomeEstoque').value.trim();
    if (!nome) return alert('Informe o nome do custo.');

    const tipoCalculo = document.getElementById('cadTipoCalculoEstoque').value;
    const categoria = document.getElementById('cadCategoriaEstoque').value;
    const unidade = document.getElementById('cadUnidadeEstoque').value.trim() || 'un';
    const observacao = document.getElementById('cadObsEstoque').value.trim();

    const payload = {
        nome,
        categoria,
        tipoCalculo,
        unidade,
        observacao,
        ativo: true,
        precoTotal: parseFloat(document.getElementById('cadPrecoTotalEstoque').value) || 0,
        quantidadeTotal: parseFloat(document.getElementById('cadQtdTotalEstoque').value) || 0,
        custoUnitario: parseFloat(document.getElementById('cadCustoUnitarioEstoque').value) || 0,
        valorMensal: parseFloat(document.getElementById('cadValorMensalEstoque').value) || 0,
        numParcelas: parseFloat(document.getElementById('cadNumParcelasEstoque')?.value) || 0,
        custoPorHora: parseFloat(document.getElementById('cadCustoHoraEstoque').value) || 0
    };

    payload.custoUnitario = calcularCustoUnitario(payload);

    if (tipoCalculo === 'lote') {
        if (payload.quantidadeTotal <= 0) return alert('Informe a quantidade do lote.');
        if (payload.precoTotal <= 0) return alert('Informe o preço total pago.');
        payload.estoqueAtual = payload.quantidadeTotal;
    }

    try {
        const Model = getCustoItemModel();
        await Model.create(payload);
        await carregarCustos();
        if (typeof atualizarRelatorioFinanceiro === 'function') atualizarRelatorioFinanceiro();
        alert('Custo cadastrado com sucesso!');
        
        document.getElementById('cadNomeEstoque').value = '';
        document.getElementById('cadObsEstoque').value = '';
        document.getElementById('cadPrecoTotalEstoque').value = '';
        const precoParcelaEl = document.getElementById('cadPrecoTotalParcelaEstoque');
        if (precoParcelaEl) precoParcelaEl.value = '';
        const numParcelaEl = document.getElementById('cadNumParcelasEstoque');
        if (numParcelaEl) numParcelaEl.value = '';
        document.getElementById('cadQtdTotalEstoque').value = '';
        document.getElementById('cadCustoUnitarioEstoque').value = '';
        document.getElementById('cadValorMensalEstoque').value = '';
        document.getElementById('cadCustoHoraEstoque').value = '';
        atualizarPreviewCustoCadastroEstoque();
        renderListaCustosCadastroEstoque();
    } catch (err) {
        alert('Erro ao salvar custo: ' + err.message);
    }
}

function renderListaCustosCadastroEstoque() {
    const lista = document.getElementById('lista-custos-cadastro-estoque');
    if (!lista) return;

    const filtro = (document.getElementById('filtroCategoriaCustosEstoque') || {}).value || '';

    const itens = custosCache.filter(c => !filtro || c.categoria === filtro);

    if (itens.length === 0) {
        lista.innerHTML = '<p class="empty-msg">Nenhum custo cadastrado nesta categoria.</p>';
        return;
    }

    lista.innerHTML = itens.map(c => {
        const unit = c.custoUnitario || calcularCustoUnitario(c);
        let detalhe = '';
        if (c.tipoCalculo === 'lote') {
            detalhe = `${formatarMoeda(c.precoTotal)} ÷ ${c.quantidadeTotal} ${c.unidade} | Estoque: ${c.estoqueAtual ?? c.quantidadeTotal}`;
        } else if (c.tipoCalculo === 'parcela_mensal') {
            detalhe = `${formatarMoeda(c.valorMensal)}/mês | ~${formatarMoeda(unit)}/h`;
        } else if (c.tipoCalculo === 'por_hora') {
            detalhe = `${formatarMoeda(unit)}/hora`;
        } else {
            detalhe = `${formatarMoeda(unit)}/${c.unidade}`;
        }

        return `
            <div class="item-row" style="border-left-color: #8b5cf6">
                <div class="item-info">
                    <b>${c.nome}</b>
                    <span>${LABEL_CATEGORIA[c.categoria] || c.categoria} · ${LABEL_TIPO[c.tipoCalculo] || c.tipoCalculo}</span>
                    <span style="display:block;margin-top:4px;color:#94a3b8;">${detalhe}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="item-val" style="color:#c4b5fd">${formatarMoeda(unit)}</div>
                    <button class="btn-delete-row" onclick="excluirCustoItem('${idCusto(c)}')" title="Excluir">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// ATUALIZAÇÃO AUTOMÁTICA
// ==========================================

let autoUpdateFinanceiroInterval = null;

function iniciarAtualizacaoAutomaticaFinanceiro() {
    // Limpar intervalo existente se houver
    if (autoUpdateFinanceiroInterval) {
        clearInterval(autoUpdateFinanceiroInterval);
    }
    
    // Limpar cache e atualizar imediatamente
    custosCache = [];
    carregarCustos();
    
    // Atualizar também o cache de estoque
    if (typeof window.estoqueCache !== 'undefined' && typeof window.getEstoqueModel === 'function') {
        window.getEstoqueModel().find({}).then(estoque => {
            window.estoqueCache = estoque;
            console.log('[financeiro] Cache de estoque atualizado com', estoque.length, 'itens');
        }).catch(err => {
            console.error('[financeiro] Erro ao atualizar cache de estoque:', err);
        });
    }
    
    // Atualizar a cada 5 segundos
    autoUpdateFinanceiroInterval = setInterval(() => {
        // Só atualizar se as abas financeiro ou calculadora estiverem visíveis
        const secFinanceiro = document.getElementById('sec-financeiro');
        const secCalculadora = document.getElementById('sec-calculadora');
        if ((secFinanceiro && secFinanceiro.style.display !== 'none') ||
            (secCalculadora && secCalculadora.style.display !== 'none')) {
            carregarCustos();
            
            // Atualizar também o cache de estoque periodicamente
            if (typeof window.estoqueCache !== 'undefined' && typeof window.getEstoqueModel === 'function') {
                window.getEstoqueModel().find({}).then(estoque => {
                    window.estoqueCache = estoque;
                }).catch(err => {
                    console.error('[financeiro] Erro ao atualizar cache de estoque:', err);
                });
            }
        }
    }, 5000);
    
    console.log('Atualização automática financeiro iniciada (5 segundos)');
}

function pararAtualizacaoAutomaticaFinanceiro() {
    if (autoUpdateFinanceiroInterval) {
        clearInterval(autoUpdateFinanceiroInterval);
        autoUpdateFinanceiroInterval = null;
        console.log('Atualização automática financeiro parada');
    }
}

if (typeof window !== 'undefined') {
    window.carregarCustos = carregarCustos;
    window.salvarCustoItem = salvarCustoItem;
    window.excluirCustoItem = excluirCustoItem;
    window.subNavControle = subNavControle;
    window.coletarCustosExtrasLinhas = coletarCustosExtrasLinhas;
    window.adicionarLinhaCustoExtra = adicionarLinhaCustoExtra;
    window.atualizarSubtotalLinhaCusto = atualizarSubtotalLinhaCusto;
    window.removerLinhaCustoExtra = removerLinhaCustoExtra;
    window.atualizarFormularioCustoCadastro = atualizarFormularioCustoCadastro;
    window.atualizarPreviewCustoCadastro = atualizarPreviewCustoCadastro;
    window.atualizarRelatorioFinanceiro = atualizarRelatorioFinanceiro;
    window.atualizarFiltroPeriodo = atualizarFiltroPeriodo;
    window.baixarEstoqueCustosExtras = baixarEstoqueCustosExtras;
    window.renderListaCustosCadastro = renderListaCustosCadastro;
    window.atualizarFormularioCustoCadastroEstoque = atualizarFormularioCustoCadastroEstoque;
    window.atualizarPreviewCustoCadastroEstoque = atualizarPreviewCustoCadastroEstoque;
    window.salvarCustoItemEstoque = salvarCustoItemEstoque;
    window.renderListaCustosCadastroEstoque = renderListaCustosCadastroEstoque;
    window.iniciarAtualizacaoAutomaticaFinanceiro = iniciarAtualizacaoAutomaticaFinanceiro;
    window.pararAtualizacaoAutomaticaFinanceiro = pararAtualizacaoAutomaticaFinanceiro;
}
