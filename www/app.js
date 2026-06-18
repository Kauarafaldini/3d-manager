const {
    getVendaModel,
    getEstoqueModel,
    getModeloModel,
    getMongoose
} = window.dbBridge;

const mongoose = getMongoose();

// Cache local para a interface
let modelosCache = [];
let estoqueCache = [];
// Gerenciar exibição visual do status da conexão com o servidor
function atualizarStatusConexao(conectado) {
    const indicator = document.getElementById('db-status-indicator');
    if (!indicator) return;
    if (conectado) {
        indicator.style.color = '#10b981';
        indicator.innerHTML = '<span class="status-dot" style="width: 8px; height: 8px; background-color: #10b981; border-radius: 50%; display: inline-block;"></span> Servidor online';
    } else {
        indicator.style.color = '#ef4444';
        indicator.innerHTML = '<span class="status-dot" style="width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%; display: inline-block;"></span> Servidor offline';
    }
}

// Ouvintes de eventos globais do Mongoose para atualizar o indicador em tempo real
mongoose.connection.on('connected', () => atualizarStatusConexao(true));
mongoose.connection.on('disconnected', () => atualizarStatusConexao(false));
mongoose.connection.on('error', () => atualizarStatusConexao(false));

function verificarConexao() {
    const status = mongoose.connection.readyState === 1;
    atualizarStatusConexao(status);
}

setInterval(verificarConexao, 5000);

function bancoOnline() {
    return mongoose.connection.readyState === 1;
}

// Navegação UI
function nav(tab, btn) {
    document.querySelectorAll('.app-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById(`sec-${tab}`).style.display = 'block';
    btn.classList.add('active');
    
    const titles = {
        home: 'Visão Geral',
        financeiro: 'Financeiro',
        calculadora: 'Calculadora de Preços',
        terminal: 'Terminal de Vendas',
        'estoque-produtos': 'Estoque de Produtos',
        estoque: 'Estoque'
    };
    document.getElementById('tab-title').innerText = titles[tab] || tab;

    if (tab === 'home' && typeof atualizarOverviewHome === 'function') {
        atualizarOverviewHome();
    }

    if (tab === 'financeiro' || tab === 'estoque' || tab === 'calculadora') {
        garantirCamposEditaveis();
    }

    if (tab === 'financeiro') {
        if (typeof carregarCustos === 'function') carregarCustos();
        if (typeof subNavControle === 'function') subNavControle('relatorio');
    }

    if (tab === 'calculadora') {
        if (typeof carregarCustos === 'function') carregarCustos();
        if (typeof carregarListaModelos === 'function') carregarListaModelos();
        atualizarOpcoesCanal();
        
        // Atualizar o cache de estoque ao abrir a calculadora
        const EstoqueModel = getEstoqueModel();
        if (EstoqueModel) {
            EstoqueModel.find({}).then(estoque => {
                estoqueCache = estoque;
                console.log('[calculadora] Cache de estoque atualizado com', estoque.length, 'itens');
                if (document.querySelectorAll('.linha-filamento').length > 0) {
                    atualizarTodosSelectsFilamento();
                }
            }).catch(err => {
                console.error('[calculadora] Erro ao atualizar cache de estoque:', err);
            });
        }
        
        const container = document.getElementById('container-filamentos-linhas');
        if (container && container.children.length === 0) {
            adicionarLinhaFilamento();
        }
        atualizarTempoResumo();
        calcFinanceiro(false);
    }

    // Iniciar atualização automática para financeiro e calculadora
    if (tab === 'financeiro' || tab === 'calculadora') {
        if (typeof iniciarAtualizacaoAutomaticaFinanceiro === 'function') {
            iniciarAtualizacaoAutomaticaFinanceiro();
        }
    } else {
        // Parar atualização automática ao sair
        if (typeof pararAtualizacaoAutomaticaFinanceiro === 'function') {
            pararAtualizacaoAutomaticaFinanceiro();
        }
    }

    if (tab === 'terminal') {
        produtoSelecionadoTerminal = null;
        document.getElementById('termBuscaProduto').value = '';
        const formVenda = document.getElementById('termFormVenda');
        if (formVenda) formVenda.style.display = 'none';
        document.getElementById('termQuantidade').value = 1;
        document.getElementById('termCanal').value = 'direta';
        document.getElementById('termPedidoId').value = '';
        if (typeof carregarEstoqueProdutos === 'function') {
            carregarEstoqueProdutos().then(() => {
                if (typeof buscarProdutoTerminal === 'function') buscarProdutoTerminal();
            });
        }
        if (typeof renderizarUltimasVendas === 'function') renderizarUltimasVendas();
        if (typeof subNavTerminal === 'function') subNavTerminal('venda');
    }

    if (tab === 'estoque') {
        if (typeof atualizarInterface === 'function') {
            atualizarInterface();
        }
        if (typeof subNavEstoque === 'function') {
            subNavEstoque('produtos');
        }
        if (typeof iniciarAtualizacaoAutomatica === 'function') {
            iniciarAtualizacaoAutomatica();
        }
    } else {
        // Parar atualização automática ao sair da aba de estoque
        if (typeof pararAtualizacaoAutomatica === 'function') {
            pararAtualizacaoAutomatica();
        }
    }
}

function atualizarInterfaceCanais() {
    const canal = document.getElementById('pCanal').value;
    const blocoFreteMl = document.getElementById('ml-bloco-frete');
    if (blocoFreteMl) {
        blocoFreteMl.style.display = document.getElementById('mlFreteGratis')?.checked ? 'block' : 'none';
    }
    const blocoTabelaShopee = document.getElementById('shopee-bloco-tabela');
    if (blocoTabelaShopee) {
        blocoTabelaShopee.style.display = document.getElementById('shopeeTabelaOficial')?.checked ? 'block' : 'none';
    }
}

async function atualizarOverviewHome() {
    try {
        const ModeloModel = typeof getModeloModel === 'function' ? getModeloModel() : null;
        const VendaModel = typeof getVendaModel === 'function' ? getVendaModel() : null;
        const EstoqueModel = typeof getEstoqueModel === 'function' ? getEstoqueModel() : null;
        const CustoItemModel = typeof getCustoItemModel === 'function' ? getCustoItemModel() : null;

        const [modelosCount, vendasAll, custosCount, estoqueCount, estoqueItems] = await Promise.all([
            ModeloModel ? ModeloModel.countDocuments() : 0,
            VendaModel ? VendaModel.find().lean() : [],
            CustoItemModel ? CustoItemModel.countDocuments() : 0,
            EstoqueModel ? EstoqueModel.countDocuments() : 0,
            EstoqueModel ? EstoqueModel.find().lean() : []
        ]);

        const totalLucro = vendasAll.reduce((sum, item) => sum + (Number(item.lucro) || 0), 0);
        const totalBruto = vendasAll.reduce((sum, item) => sum + (Number(item.bruto) || 0), 0);
        const totalFilamento = estoqueItems.reduce((sum, item) => sum + (Number(item.gramas) || 0), 0);

        document.getElementById('homeTotalVendas').textContent = vendasAll.length;
        document.getElementById('homeTotalLucro').textContent = `R$ ${totalLucro.toFixed(2)}`;
        document.getElementById('homeTotalBruto').textContent = `R$ ${totalBruto.toFixed(2)}`;
        document.getElementById('homeEstoqueFilamento').textContent = `${totalFilamento} g`;
        document.getElementById('homeTotalModelos').textContent = modelosCount;
        document.getElementById('homeTotalCustos').textContent = custosCount;
    } catch (err) {
        console.error('Erro ao atualizar overview do Home:', err);
    }
}

function normalizarTempoMinutos() {
    const minEl = document.getElementById('pTempoMinutos');
    const horaEl = document.getElementById('pTempoHoras');
    if (!minEl || !horaEl) return;
    let m = parseInt(minEl.value, 10);
    if (isNaN(m) || m < 0) m = 0;
    if (m >= 60) {
        horaEl.value = (parseInt(horaEl.value, 10) || 0) + Math.floor(m / 60);
        minEl.value = m % 60;
    }
}

function obterTempoHoras() {
    normalizarTempoMinutos();
    const h = parseInt(document.getElementById('pTempoHoras')?.value, 10) || 0;
    const m = parseInt(document.getElementById('pTempoMinutos')?.value, 10) || 0;
    return h + m / 60;
}

function definirTempoCampos(horasDecimais) {
    const total = Math.max(0, parseFloat(horasDecimais) || 0);
    let h = Math.floor(total);
    let m = Math.round((total - h) * 60);
    if (m >= 60) { h += 1; m = 0; }
    const horaEl = document.getElementById('pTempoHoras');
    const minEl = document.getElementById('pTempoMinutos');
    if (horaEl) horaEl.value = h;
    if (minEl) minEl.value = m;
    atualizarTempoResumo();
}

function atualizarTempoResumo() {
    const h = parseInt(document.getElementById('pTempoHoras')?.value, 10) || 0;
    const m = parseInt(document.getElementById('pTempoMinutos')?.value, 10) || 0;
    const decimal = h + m / 60;
    const texto = `${h}h ${m}min (${decimal.toFixed(2).replace('.', ',')} h)`;
    const eq = document.getElementById('resTempoEquiv');
    const res = document.getElementById('resTempoResumo');
    if (eq) eq.textContent = `Total: ${texto}`;
    if (res) res.textContent = `${h}h ${m}min`;
}

function onTempoInput() {
    atualizarTempoResumo();
    calcFinanceiro(false);
}

if (typeof window !== 'undefined') {
    window.onTempoInput = onTempoInput;
    window.definirTempoCampos = definirTempoCampos;
    window.obterTempoHoras = obterTempoHoras;
    window.atualizarOpcoesCanal = atualizarOpcoesCanal;
    window.salvarModeloPadrao = salvarModeloPadrao;
    window.carregarListaModelos = carregarListaModelos;
    window.vincularProdutoCalculadora = vincularProdutoCalculadora;
    window.definirVinculoProdutoReceita = definirVinculoProdutoReceita;
    window.limparVinculoProdutoReceita = limparVinculoProdutoReceita;
    window.atualizarSelectProdutosCalculadora = atualizarSelectProdutosCalculadora;
    window.getModeloModel = getModeloModel;
    window.getEstoqueModel = getEstoqueModel;
    window.lancarVendaFinanceiro = lancarVendaFinanceiro;
    window.subNavEstoque = subNavEstoque;
    window.editarEstoque = editarEstoque;
    window.atualizarEstoque = atualizarEstoque;
}

function atualizarOpcoesCanal() {
    const canal = document.getElementById('pCanal').value;
    document.getElementById('opcoes-shopee').style.display = canal === 'shopee' ? 'block' : 'none';
    document.getElementById('opcoes-ml').style.display = canal === 'ml' ? 'block' : 'none';
    atualizarInterfaceCanais();
    calcFinanceiro(false);
}

function subNavEstoque(painel) {
    const sec = document.getElementById('sec-estoque');
    if (!sec) return;

    sec.querySelectorAll('.controle-subtab').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.painel === painel) btn.classList.add('active');
    });

    sec.querySelectorAll('.controle-painel').forEach(p => {
        p.style.display = 'none';
    });

    const painelAtivo = document.getElementById(`painel-${painel}`);
    if (painelAtivo) painelAtivo.style.display = 'block';

    if (painel === 'produtos' && typeof carregarEstoqueProdutos === 'function') {
        document.getElementById('estoqueBusca')?.focus();
        carregarEstoqueProdutos();
    }
    if (painel === 'materiais' && typeof atualizarInterface === 'function') {
        atualizarInterface();
    }
    if (painel === 'lancamentos' && typeof carregarCustos === 'function') {
        carregarCustos();
        atualizarFormularioCustoCadastroEstoque();
    }
}

async function lancarVendaFinanceiro() {
    console.log('=== INICIANDO lancarVendaFinanceiro ===');
    if (!bancoOnline()) {
        console.log('ERRO: Servidor offline');
        return alert("Servidor offline. Verifique a conexão e faça login novamente.");
    }

    const dados = calcFinanceiro();
    const nome = document.getElementById('pNome').value || "Venda Avulsa";
    console.log('Nome da venda:', nome);
    console.log('Dados da venda:', dados);

    if (dados.venda <= 0) {
        console.log('ERRO: Valor de venda inválido');
        return alert("Insira o valor da venda ou calcule pelo Markup!");
    }

    try {
        const VendaModel = getVendaModel();
        console.log('VendaModel obtido:', VendaModel);

        const novaVenda = new VendaModel({
            nome,
            lucro: dados.lucroReal,
            bruto: dados.venda,
            custo: dados.custoProducao,
            canal: document.getElementById('pCanal').value,
            filamentosUsados: dados.filamentosUsados,
            detalheCustos: {
                material: dados.custoMat,
                custoProducaoTotal: dados.custoProducaoTotal,
                quantidadeChapa: dados.quantidadeChapa,
                energia: dados.custoEnergia,
                maquina: dados.custoMaquina,
                trabalho: dados.custoTrabalho,
                desgaste: dados.custoDesgaste,
                embalagem: dados.embalagem,
                extras: dados.custoExtras,
                tempoHoras: dados.tempo
            },
            custosExtras: dados.custosExtras,
            taxas: { comissao: dados.valorComissao, fixa: dados.taxaFixa }
        });
        console.log('Salvando venda no banco...');
        await novaVenda.save();
        console.log('Venda salva com sucesso:', novaVenda);

        if (typeof mostrarToast === 'function') mostrarToast('Venda lançada no financeiro!');

        // Limpar formulário
        document.getElementById('pNome').value = '';
        document.getElementById('pSKU').value = '';
        document.getElementById('pModeloSelect').value = '';
        document.getElementById('pQuantidadeChapa').value = 1;

        console.log('Chamando carregarCustos...');
        if (typeof carregarCustos === 'function') await carregarCustos();
        console.log('carregarCustos concluído');
    } catch (err) {
        console.error('Erro ao lançar venda:', err);
        alert("Erro ao lançar venda: " + err.message);
    }
}

// Garante que inputs permaneçam editáveis (evita readOnly "preso" após atualizar estoque)
function liberarInput(el) {
    if (!el) return;
    el.readOnly = false;
    el.disabled = false;
    el.removeAttribute('readonly');
    el.removeAttribute('disabled');
}

function idEstoque(item) {
    return item && item._id ? item._id.toString() : '';
}

function garantirCamposEditaveis(raiz = document) {
    raiz.querySelectorAll('#app-screen input:not([type="checkbox"]), #app-screen select, #app-screen textarea').forEach(liberarInput);
}

// Funções dinâmicas de múltiplos filamentos
function adicionarLinhaFilamento(dados = null) {
    const container = document.getElementById('container-filamentos-linhas');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'linha-filamento';

    let selectHtml = `<select class="fSelect" onchange="alterarLinhaFilamento(this)" style="flex: 2;">
        <option value="">-- Manual (R$/Kg) --</option>`;
    estoqueCache.forEach(e => {
        const gramas = Number(e.gramas) || 0;
        selectHtml += `<option value="${idEstoque(e)}">${e.nome} (${gramas.toFixed(0)}g rest.)</option>`;
    });
    selectHtml += `</select>`;

    row.innerHTML = `
        ${selectHtml}
        <input type="number" class="fPreco" placeholder="R$/Kg" style="flex: 1;" oninput="calcFinanceiro(false)" value="${dados && dados.precoKg != null ? dados.precoKg : ''}">
        <input type="number" class="fPeso" placeholder="Gramas" style="flex: 1;" oninput="calcFinanceiro(false)" value="${dados && dados.peso != null ? dados.peso : ''}">
        <button type="button" class="btn-delete-row" onclick="removerLinhaFilamento(this)" title="Remover filamento">✕</button>
    `;

    container.appendChild(row);

    const selectEl = row.querySelector('.fSelect');
    const precoInput = row.querySelector('.fPreco');
    const pesoInput = row.querySelector('.fPeso');

    liberarInput(precoInput);
    liberarInput(pesoInput);
    liberarInput(selectEl);

    if (dados && dados.estoqueId) {
        selectEl.value = dados.estoqueId;
        sincronizarPrecoFilamento(row);
    } else if (dados) {
        selectEl.value = "";
    }

    calcFinanceiro(false);
}

function sincronizarPrecoFilamento(row) {
    const selectEl = row.querySelector('.fSelect');
    const precoInput = row.querySelector('.fPreco');
    if (!selectEl || !precoInput || !selectEl.value) return;

    const filamento = estoqueCache.find(e => idEstoque(e) === selectEl.value);
    if (filamento && !precoInput.value) {
        precoInput.value = filamento.precoKg.toFixed(2);
    }
}

function alterarLinhaFilamento(selectEl) {
    const row = selectEl.closest('.linha-filamento');
    const precoInput = row.querySelector('.fPreco');
    const val = selectEl.value;

    liberarInput(precoInput);

    if (!val) {
        precoInput.value = "";
    } else {
        const filamento = estoqueCache.find(e => idEstoque(e) === val);
        if (filamento) {
            precoInput.value = filamento.precoKg.toFixed(2);
        }
    }
    calcFinanceiro(false);
}

function removerLinhaFilamento(btnEl) {
    const row = btnEl.closest('.linha-filamento');
    row.remove();
    calcFinanceiro(false);
}

// ==========================================
// MOTOR DE PRECIFICAÇÃO
// ==========================================
function calcFinanceiro(foiAlteradoPelaMargem = false) {
    let pesoTotal = 0;
    let custoMat = 0;
    let filamentosUsados = [];

    document.querySelectorAll('.linha-filamento').forEach(linha => {
        const selectEl = linha.querySelector('.fSelect');
        const precoInput = linha.querySelector('.fPreco');
        const pesoInput = linha.querySelector('.fPeso');

        const precoKg = parseFloat(precoInput.value) || 0;
        const peso = parseFloat(pesoInput.value) || 0;
        const estoqueId = selectEl.value || null;
        
        let nome = 'Manual';
        if (estoqueId) {
            const opt = selectEl.options[selectEl.selectedIndex];
            if (opt) {
                nome = opt.text.split(' (')[0];
            }
        }

        pesoTotal += peso;
        custoMat += (peso / 1000) * precoKg;

        if (peso > 0) {
            filamentosUsados.push({ estoqueId, nome, peso, precoKg });
        }
    });

    const tempo = obterTempoHoras();
    const energiaKwh = parseFloat(document.getElementById('pEnergia').value) || 0;
    const potenciaW = parseFloat(document.getElementById('pPotencia').value) || 0;
    const trabalhoHora = parseFloat(document.getElementById('pTrabalhoHora').value) || 0;
    const desgasteHora = parseFloat(document.getElementById('pDesgaste').value) || 0;
    const embalagem = parseFloat(document.getElementById('pEmbalagem').value) || 0;
    const quantidadeChapa = parseFloat(document.getElementById('pQuantidadeChapa').value) || 1;

    const custoTrabalho = tempo * trabalhoHora;
    const custoDesgaste = tempo * desgasteHora;
    const custoEnergia = tempo * energiaKwh;
    const custoMaquina = custoTrabalho + custoDesgaste;

    const extrasColetados = typeof coletarCustosExtrasLinhas === 'function'
        ? coletarCustosExtrasLinhas()
        : { total: 0, itens: [] };
    const custoExtras = extrasColetados.total;

    const custoProducaoTotal = custoMat + custoEnergia + custoMaquina + embalagem + custoExtras;
    const custoProducao = quantidadeChapa > 0 ? custoProducaoTotal / quantidadeChapa : custoProducaoTotal;

    const canal = document.getElementById('pCanal').value;
    let venda = parseFloat(document.getElementById('pVenda').value) || 0;
    const markupDesejado = parseFloat(document.getElementById('pMargemDesejada').value) || 0;

    let taxaComissaoPct = 0;
    let taxaFixa = 0;

    if (foiAlteradoPelaMargem && markupDesejado > 0) {
        const m = markupDesejado / 100;
        const lucroSobreCusto = custoProducao * m;
        const custoELucro = custoProducao + lucroSobreCusto;

        if (canal === 'direta') {
            venda = custoELucro;
        } else if (canal === 'shopee') {
            venda = calcularVendaShopee(custoELucro, obterConfigShopee());
        } else if (canal === 'ml') {
            venda = calcularVendaML(custoELucro, obterConfigML());
        }

        const vendaEl = document.getElementById('pVenda');
        if (document.activeElement !== vendaEl) {
            vendaEl.value = venda.toFixed(2);
        }
    }

    if (canal === 'direta') {
        taxaComissaoPct = 0;
        taxaFixa = 0;
    } else if (canal === 'shopee') {
        const t = resolverTaxasShopee(venda, obterConfigShopee());
        taxaComissaoPct = t.taxaComissaoPct;
        taxaFixa = t.taxaFixa;
    } else if (canal === 'ml') {
        const t = resolverTaxasML(venda, obterConfigML());
        taxaComissaoPct = t.taxaComissaoPct;
        taxaFixa = t.taxaFixa;
    }

    const valorComissao = venda * taxaComissaoPct;
    const vendaTotal = venda * quantidadeChapa;
    const lucroReal = vendaTotal - custoProducaoTotal - (valorComissao * quantidadeChapa) - (taxaFixa * quantidadeChapa);
    const markupReal = custoProducao > 0 ? (lucroReal / (custoProducao * quantidadeChapa)) * 100 : 0;

    const margemEl = document.getElementById('pMargemDesejada');
    if (!foiAlteradoPelaMargem && document.activeElement !== margemEl) {
        margemEl.value = markupReal.toFixed(1);
    }

    document.getElementById('resPesoTotal').innerText = `${pesoTotal.toFixed(1)} g`;
    document.getElementById('resCustoMat').innerText = `R$ ${custoMat.toFixed(2)}`;
    const resTrab = document.getElementById('resCustoTrabalho');
    if (resTrab) resTrab.innerText = `R$ ${custoTrabalho.toFixed(2)}`;
    document.getElementById('resCustoMaquina').innerText = `R$ ${custoDesgaste.toFixed(2)}`;
    document.getElementById('resCustoEnergia').innerText = `R$ ${custoEnergia.toFixed(2)}`;
    atualizarTempoResumo();
    document.getElementById('resEmbalagem').innerText = `R$ ${embalagem.toFixed(2)}`;
    const resExtras = document.getElementById('resCustoExtras');
    if (resExtras) resExtras.innerText = `R$ ${custoExtras.toFixed(2)}`;

    document.getElementById('resCustoTotalProducao').innerText = `R$ ${custoProducaoTotal.toFixed(2)} (Total) / R$ ${custoProducao.toFixed(2)} (Unitário)`;
    document.getElementById('resTaxaCanal').innerText = `R$ ${valorComissao.toFixed(2)} (${(taxaComissaoPct*100).toFixed(1)}%)`;
    document.getElementById('resFixoCanal').innerText = `R$ ${taxaFixa.toFixed(2)}`;
    document.getElementById('resLucro').innerText = `R$ ${lucroReal.toFixed(2)}`;
    document.getElementById('resMargemReal').innerText = `Markup Real: ${markupReal.toFixed(1)}%`;
    
    return {
        custoProducao,
        custoProducaoTotal,
        valorComissao,
        taxaFixa,
        lucroReal,
        venda,
        canal,
        filamentosUsados,
        pesoTotal,
        custoMat,
        custoEnergia,
        custoMaquina,
        custoTrabalho,
        custoDesgaste,
        tempo,
        embalagem,
        custoExtras,
        custosExtras: extrasColetados.itens,
        quantidadeChapa
    };
}

// ==========================================
// FUNÇÕES DE BANCO DE DADOS E INTERFACE
// ==========================================

async function registrarVenda() {
    if (!bancoOnline()) {
        return alert("Servidor offline. Verifique a conexão e faça login novamente.");
    }

    const dados = calcFinanceiro();
    const nome = document.getElementById('pNome').value || "Venda Avulsa";

    if (dados.venda <= 0) return alert("Insira o valor da venda ou calcule pelo Markup!");

    let estoqueInsuficiente = false;
    let msgEstoque = "";
    
    dados.filamentosUsados.forEach(f => {
        if (f.estoqueId) {
            const filamento = estoqueCache.find(e => e._id.toString() === f.estoqueId);
            if (filamento && filamento.gramas < f.peso) {
                estoqueInsuficiente = true;
                msgEstoque += `- ${filamento.nome}: precisa de ${f.peso.toFixed(0)}g, resta ${filamento.gramas.toFixed(0)}g\n`;
            }
        }
    });

    if (estoqueInsuficiente) {
        if (!confirm(`Atenção! Estoque insuficiente para os seguintes filamentos:\n\n${msgEstoque}\nDeseja registrar a venda mesmo assim?`)) {
            return;
        }
    }

    try {
        const EstoqueModel = getEstoqueModel();
        const VendaModel = getVendaModel();

        for (const f of dados.filamentosUsados) {
            if (f.estoqueId) {
                const filamento = estoqueCache.find(e => e._id.toString() === f.estoqueId);
                if (filamento) {
                    const novaQuantidade = Math.max(0, filamento.gramas - f.peso);
                    await EstoqueModel.findByIdAndUpdate(f.estoqueId, { gramas: novaQuantidade });
                }
            }
        }

        if (typeof baixarEstoqueCustosExtras === 'function' && dados.custosExtras.length) {
            await baixarEstoqueCustosExtras(dados.custosExtras);
        }

        const novaVenda = new VendaModel({
            nome,
            lucro: dados.lucroReal,
            bruto: dados.venda,
            custo: dados.custoProducao,
            canal: document.getElementById('pCanal').value,
            filamentosUsados: dados.filamentosUsados,
            detalheCustos: {
                material: dados.custoMat,
                custoProducaoTotal: dados.custoProducaoTotal,
                quantidadeChapa: dados.quantidadeChapa,
                energia: dados.custoEnergia,
                maquina: dados.custoMaquina,
                trabalho: dados.custoTrabalho,
                desgaste: dados.custoDesgaste,
                embalagem: dados.embalagem,
                extras: dados.custoExtras,
                tempoHoras: dados.tempo
            },
            custosExtras: dados.custosExtras,
            taxas: { comissao: dados.valorComissao, fixa: dados.taxaFixa }
        });
        await novaVenda.save();

        const btnVendas = document.querySelectorAll('.nav-item')[2];
        if (btnVendas) nav('financeiro', btnVendas);

        await aposOperacaoSalvar({
            mensagem: 'Venda registrada! Formulário liberado para o próximo item.',
            resetFn: resetFormularioVenda,
            foco: '#pNome'
        });
        if (typeof carregarCustos === 'function') await carregarCustos();
    } catch (err) {
        alert("Erro ao salvar no banco: " + err.message);
        if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
    }
}

async function adicionarEstoque() {
    if (!bancoOnline()) {
        return alert("Servidor offline.");
    }

    const nome = document.getElementById('estNome').value;
    const preco = parseFloat(document.getElementById('estPreco').value);
    const peso = parseFloat(document.getElementById('estGrama').value);

    if(!nome || !preco) return alert("Preencha os dados do filamento!");

    try {
        const EstoqueModel = getEstoqueModel();
        const novoEstoque = new EstoqueModel({ nome, precoKg: preco, gramas: peso });
        await novoEstoque.save();
        
        // Atualizar o cache de estoque
        const estoqueAtualizado = await EstoqueModel.find({});
        estoqueCache = estoqueAtualizado;
        
        // Atualizar a interface para mostrar o novo filamento na lista
        await atualizarInterface();
        
        await aposOperacaoSalvar({
            mensagem: 'Filamento salvo no estoque!',
            resetFn: resetFormularioEstoque,
            foco: '#estNome'
        });
    } catch (err) {
        alert("Erro ao salvar no banco: " + err.message);
        if (typeof reativarFormularios === 'function') reativarFormularios('#estNome');
    }
}

async function sincronizarFilamentosReceita(filamentosUsados) {
    const EstoqueModel = getEstoqueModel();
    const filamentosAtualizados = [...filamentosUsados];

    for (let i = 0; i < filamentosAtualizados.length; i++) {
        const f = filamentosAtualizados[i];
        if (f.estoqueId) continue;

        const nomeFilamento = (f.nome && f.nome !== 'Manual') ? f.nome.trim() : '';
        const precoKg = parseFloat(f.precoKg) || 0;
        if (!nomeFilamento || precoKg <= 0) continue;

        const existente = estoqueCache.find(e =>
            e.nome && e.nome.toLowerCase() === nomeFilamento.toLowerCase()
        );

        if (existente) {
            filamentosAtualizados[i] = { ...f, estoqueId: idEstoque(existente), nome: existente.nome };
            continue;
        }

        const novoFilamento = new EstoqueModel({
            nome: nomeFilamento,
            precoKg,
            gramas: 1000
        });
        await novoFilamento.save();
        estoqueCache.push(novoFilamento);
        filamentosAtualizados[i] = { ...f, estoqueId: idEstoque(novoFilamento), nome: nomeFilamento };
    }

    return filamentosAtualizados;
}

function dadosModeloReceita(dados) {
    return {
        sku: document.getElementById('pSKU').value?.trim() || '',
        tempo: obterTempoHoras(),
        energia: parseFloat(document.getElementById('pEnergia').value) || 0,
        potencia: parseFloat(document.getElementById('pPotencia').value) || 0,
        desgaste: parseFloat(document.getElementById('pDesgaste').value) || 0,
        trabalhoHora: parseFloat(document.getElementById('pTrabalhoHora').value) || 0,
        embalagem: parseFloat(document.getElementById('pEmbalagem').value) || 0,
        quantidadeChapa: parseFloat(document.getElementById('pQuantidadeChapa').value) || 1,
        filamentosUsados: dados.filamentosUsados,
        custoProducao: dados.custoProducao,
        custoProducaoTotal: dados.custoProducaoTotal,
        venda: dados.venda,
        custoMat: dados.custoMat,
        custoEnergia: dados.custoEnergia,
        custoMaquina: dados.custoMaquina,
        custoTrabalho: dados.custoTrabalho,
        custoDesgaste: dados.custoDesgaste,
        custoExtras: dados.custoExtras,
        custosExtras: dados.custosExtras || [],
        temReceita: true
    };
}

function definirVinculoProdutoReceita(id) {
    const idStr = id ? String(id) : '';
    const hidden = document.getElementById('pProdutoVinculoId');
    const select = document.getElementById('pProdutoEstoqueSelect');
    if (hidden) hidden.value = idStr;
    if (select) select.value = idStr;
}

function limparVinculoProdutoReceita() {
    definirVinculoProdutoReceita('');
}

function encontrarProdutoParaReceita(nome, sku, produtoVinculoId) {
    const cacheModelos = typeof modelosCache !== 'undefined' ? modelosCache : [];
    const cacheEstoque = typeof estoqueProdutosCache !== 'undefined' ? estoqueProdutosCache : [];
    const cache = [...cacheModelos];
    cacheEstoque.forEach(p => {
        if (!cache.some(m => String(m._id) === String(p._id))) cache.push(p);
    });

    if (produtoVinculoId) {
        return cache.find(p => String(p._id) === String(produtoVinculoId));
    }
    if (sku) {
        const porSku = cache.find(p => p.sku && p.sku.toLowerCase() === sku.toLowerCase());
        if (porSku) return porSku;
    }
    return cache.find(p => p.nome && p.nome.toLowerCase() === nome.toLowerCase());
}

function obterTenantIdCriacao() {
    const user = typeof window !== 'undefined' && window.apiClient?.getUser?.();
    if (user?.tenantId && user.role === 'super_admin') return user.tenantId;
    return null;
}

async function salvarModeloPadrao() {
    if (!bancoOnline()) return alert('Servidor offline.');

    const nome = document.getElementById('pNome').value?.trim();
    if (!nome) return alert('Informe o nome do produto para salvar a receita.');

    const dados = calcFinanceiro();
    const ModeloModel = getModeloModel();
    const produtoVinculoId = document.getElementById('pProdutoVinculoId')?.value
        || document.getElementById('pProdutoEstoqueSelect')?.value
        || '';
    const sku = document.getElementById('pSKU').value?.trim() || '';

    const filamentosSincronizados = await sincronizarFilamentosReceita(dados.filamentosUsados);
    const payload = dadosModeloReceita({ ...dados, filamentosUsados: filamentosSincronizados });

    let existente = encontrarProdutoParaReceita(nome, sku, produtoVinculoId);
    if (!existente && produtoVinculoId) {
        const cache = typeof estoqueProdutosCache !== 'undefined' ? estoqueProdutosCache : modelosCache;
        existente = cache.find(p => String(p._id) === String(produtoVinculoId));
    }
    if (!existente) {
        existente = modelosCache.find(m => m.nome && m.nome.toLowerCase() === nome.toLowerCase());
    }

    const jaTemReceita = existente && (
        typeof produtoTemReceita === 'function' ? produtoTemReceita(existente) : existente.temReceita
    );
    if (jaTemReceita && !confirm(`O produto "${existente.nome}" já possui receita. Deseja substituí-la?`)) {
        return;
    }

    try {
        let savedId = null;

        if (existente) {
            const updated = await ModeloModel.findByIdAndUpdate(String(existente._id), {
                nome,
                ...payload,
                estoque: existente.estoque || 0,
                venda: payload.venda || existente.venda || 0
            });
            savedId = updated?._id || existente._id;
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Receita salva para "${nome}". Estoque mantido em ${existente.estoque || 0} un.`);
            }
        } else {
            const createData = { nome, estoque: 0, ...payload };
            const tenantId = obterTenantIdCriacao();
            if (tenantId) createData.tenantId = tenantId;

            const modelo = new ModeloModel(createData);
            await modelo.save();
            savedId = modelo._id;
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Produto e receita criados. Estoque inicial: 0 un. Registre a produção no Estoque.`);
            }
        }

        definirVinculoProdutoReceita(savedId);
        await carregarListaModelos(savedId);
        await atualizarInterface();
        if (typeof atualizarSelectProducao === 'function') atualizarSelectProducao();
        if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
    } catch (err) {
        alert('Erro ao salvar receita: ' + err.message);
        if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
    }
}

async function carregarListaModelos(idReceitaSelecionar = null) {
    try {
        const ModeloModel = getModeloModel();
        modelosCache = await ModeloModel.find({});

        if (typeof carregarEstoqueProdutos === 'function') {
            await carregarEstoqueProdutos();
        } else {
            atualizarSelectProdutosCalculadora();
        }

        const selectReceita = document.getElementById('pModeloSelect');
        if (selectReceita) {
            const fonteReceitas = (typeof estoqueProdutosCache !== 'undefined' && estoqueProdutosCache.length)
                ? estoqueProdutosCache
                : modelosCache;
            const comReceita = fonteReceitas.filter(m =>
                typeof produtoTemReceita === 'function' ? produtoTemReceita(m) : m.temReceita
            );
            selectReceita.innerHTML = '<option value="">-- Selecione uma receita --</option>';
            comReceita.forEach(m => {
                selectReceita.innerHTML += `<option value="${m._id}">${m.nome}${m.sku ? ` (${m.sku})` : ''}</option>`;
            });

            if (idReceitaSelecionar) {
                const idStr = String(idReceitaSelecionar);
                if (comReceita.some(m => String(m._id) === idStr)) {
                    selectReceita.value = idStr;
                    const btnExcluir = document.getElementById('btnExcluirModelo');
                    if (btnExcluir) btnExcluir.style.display = 'block';
                }
            }
        }
    } catch (e) {
        console.error('Erro ao carregar lista de modelos:', e);
    }
}

function atualizarSelectProdutosCalculadora() {
    const select = document.getElementById('pProdutoEstoqueSelect');
    if (!select) return;

    const cache = typeof estoqueProdutosCache !== 'undefined' ? estoqueProdutosCache : modelosCache;
    select.innerHTML = '<option value="">-- Novo produto (criar ao salvar receita) --</option>';
    cache.forEach(p => {
        const temReceita = typeof produtoTemReceita === 'function' ? produtoTemReceita(p) : p.temReceita;
        const sufixo = temReceita ? ' · com receita' : '';
        select.innerHTML += `<option value="${p._id}">${p.nome}${p.sku ? ` (${p.sku})` : ''}${sufixo}</option>`;
    });
}

function vincularProdutoCalculadora() {
    const id = document.getElementById('pProdutoEstoqueSelect')?.value;
    if (!id) {
        limparVinculoProdutoReceita();
        return;
    }

    definirVinculoProdutoReceita(id);

    const cache = typeof estoqueProdutosCache !== 'undefined' ? estoqueProdutosCache : modelosCache;
    const produto = cache.find(p => p._id.toString() === id);
    if (!produto) return;

    document.getElementById('pNome').value = produto.nome || '';
    document.getElementById('pSKU').value = produto.sku || '';
    document.getElementById('pVenda').value = produto.venda || produto.precoVenda || 0;

    const temReceita = typeof produtoTemReceita === 'function' ? produtoTemReceita(produto) : produto.temReceita;
    if (temReceita) {
        document.getElementById('pModeloSelect').value = id;
        carregarModeloPadrao();
    } else {
        document.getElementById('pModeloSelect').value = '';
        const btnExcluir = document.getElementById('btnExcluirModelo');
        if (btnExcluir) btnExcluir.style.display = 'none';
        if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
    }
}

function carregarModeloPadrao() {
    const id = document.getElementById('pModeloSelect').value;
    const btnExcluir = document.getElementById('btnExcluirModelo');

    if(!id) {
        if (btnExcluir) btnExcluir.style.display = 'none';
        limparVinculoProdutoReceita();
        return; 
    }
    
    if (btnExcluir) btnExcluir.style.display = 'block';
    definirVinculoProdutoReceita(id);

    const m = modelosCache.find(mod => mod._id.toString() === id);
    if(m) {
        document.getElementById('pNome').value = m.nome;
        document.getElementById('pSKU').value = m.sku || '';
        definirTempoCampos(m.tempo);
        document.getElementById('pEnergia').value = m.energia;
        document.getElementById('pPotencia').value = m.potencia;
        document.getElementById('pTrabalhoHora').value = m.trabalhoHora != null ? m.trabalhoHora : (m.desgaste || 0);
        document.getElementById('pDesgaste').value = m.trabalhoHora != null ? (m.desgaste || 0) : 0;
        document.getElementById('pEmbalagem').value = m.embalagem;
        document.getElementById('pQuantidadeChapa').value = m.quantidadeChapa != null ? m.quantidadeChapa : 1;
        document.getElementById('pVenda').value = m.venda || '';
        
        const container = document.getElementById('container-filamentos-linhas');
        if (container) {
            container.innerHTML = "";
            if (m.filamentosUsados && m.filamentosUsados.length > 0) {
                m.filamentosUsados.forEach(f => {
                    adicionarLinhaFilamento(f);
                });
            } else if (m.peso) {
                adicionarLinhaFilamento({ peso: m.peso, precoKg: m.precoKg, estoqueId: null });
            } else {
                adicionarLinhaFilamento();
            }
        }

        // Reload custos extras
        const containerExtras = document.getElementById('container-custos-extras-linhas');
        if (containerExtras) {
            containerExtras.innerHTML = '';
            if (m.custosExtras && m.custosExtras.length > 0 && typeof adicionarLinhaCustoExtra === 'function') {
                m.custosExtras.forEach(c => adicionarLinhaCustoExtra(c));
            }
        }

        calcFinanceiro(false);
    }
}

async function atualizarInterface() {
    try {
        const VendaModel = getVendaModel();
        const EstoqueModel = getEstoqueModel();

        const vendas = await VendaModel.find({}).sort({ data: -1 });
        const estoque = await EstoqueModel.find({});
        
        estoqueCache = estoque;

        const brutoTotal = vendas.reduce((acc, v) => acc + (v.bruto || 0), 0);
        const lucroTotal = vendas.reduce((acc, v) => acc + (v.lucro || 0), 0);
        const custoTotal = vendas.reduce((acc, v) => acc + (v.custo || 0), 0);

        const dashBruto = document.getElementById('dashBruto');
        const dashLucroTotal = document.getElementById('dashLucroTotal');
        const dashCustosTotal = document.getElementById('dashCustosTotal');
        if (dashBruto) dashBruto.innerText = `R$ ${brutoTotal.toFixed(2)}`;
        if (dashLucroTotal) dashLucroTotal.innerText = `R$ ${lucroTotal.toFixed(2)}`;
        if (dashCustosTotal) dashCustosTotal.innerText = `R$ ${custoTotal.toFixed(2)}`;

        const listaV = document.getElementById('lista-vendas-recente');
        if (listaV) {
            if (vendas.length > 0) {
                listaV.innerHTML = vendas.map(v => `
                    <div class="item-row">
                        <div class="item-info">
                            <b>${v.nome}</b>
                            <span>${(v.canal || '').toUpperCase()} | Bruto: R$ ${(v.bruto || 0).toFixed(2)} | Custo: R$ ${(v.custo || 0).toFixed(2)}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div class="item-val">+ R$ ${(v.lucro || 0).toFixed(2)}</div>
                            <button class="btn-delete-row" onclick="excluirVenda('${v._id}')" title="Excluir Lançamento">🗑️</button>
                        </div>
                    </div>
                `).join('');
            } else {
                listaV.innerHTML = '<p class="empty-msg">Nenhuma venda registrada no banco.</p>';
            }
        }

        const listaE = document.getElementById('lista-estoque');
        if (listaE) {
            if (estoque.length > 0) {
                listaE.innerHTML = estoque.map(e => {
                    const gramas = Number(e.gramas) || 0;
                    const precoKg = Number(e.precoKg) || 0;
                    return `
                        <div class="item-row" style="border-left-color: #10b981">
                            <div class="item-info">
                                <b>${e.nome}</b>
                                <span>${gramas.toFixed(0)}g disponíveis</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div class="item-val" style="color: #94a3b8">R$ ${precoKg.toFixed(2)}/kg</div>
                                <button class="btn-secondary" onclick="editarEstoque('${e._id}')" title="Editar Filamento">✏️</button>
                                <button class="btn-delete-row" onclick="excluirEstoque('${e._id}')" title="Excluir Filamento">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                listaE.innerHTML = '<p class="empty-msg">Nenhum filamento cadastrado. Adicione um rolo em Matéria-Prima.</p>';
            }
        }

        if (document.querySelectorAll('.linha-filamento').length > 0) {
            atualizarTodosSelectsFilamento();
        }
        if (typeof atualizarTodosSelectsCustoExtra === 'function') {
            atualizarTodosSelectsCustoExtra();
        }
        if (document.getElementById('sec-financeiro')?.style.display !== 'none') {
            if (typeof atualizarRelatorioFinanceiro === 'function') atualizarRelatorioFinanceiro();
        }
        garantirCamposEditaveis();
    } catch (err) {
        console.error("Erro ao atualizar interface visual:", err);
    }
}

function atualizarTodosSelectsFilamento() {
    document.querySelectorAll('.linha-filamento').forEach(row => {
        const select = row.querySelector('.fSelect');
        const preco = row.querySelector('.fPreco');
        const peso = row.querySelector('.fPeso');
        if (!select) return;

        const selectedVal = select.value;
        const precoAtual = preco ? preco.value : '';
        const pesoAtual = peso ? peso.value : '';

        select.innerHTML = '<option value="">-- Manual (R$/Kg) --</option>';
        estoqueCache.forEach(e => {
            const gramas = Number(e.gramas) || 0;
            select.innerHTML += `<option value="${idEstoque(e)}">${e.nome} (${gramas.toFixed(0)}g rest.)</option>`;
        });

        const aindaExiste = selectedVal && estoqueCache.some(e => idEstoque(e) === selectedVal);
        select.value = aindaExiste ? selectedVal : '';

        if (preco) preco.value = precoAtual;
        if (peso) peso.value = pesoAtual;

        liberarInput(preco);
        liberarInput(peso);
        liberarInput(select);

        if (aindaExiste) {
            sincronizarPrecoFilamento(row);
        }
    });
}

async function excluirVenda(id) {
    if (confirm("Deseja realmente excluir este lançamento?")) {
        try {
            const VendaModel = getVendaModel();
            await VendaModel.findByIdAndDelete(id);
            alert("Lançamento excluído com sucesso!");
            await atualizarInterface();
        } catch (err) {
            alert("Erro ao excluir: " + err.message);
        }
    }
}

async function excluirEstoque(id) {
    if (confirm("Deseja realmente excluir este filamento do estoque?")) {
        try {
            const EstoqueModel = getEstoqueModel();
            await EstoqueModel.findByIdAndDelete(id);
            alert("Filamento excluído com sucesso!");
            await atualizarInterface();
        } catch (err) {
            alert("Erro ao excluir: " + err.message);
        }
    }
}

async function editarEstoque(id) {
    try {
        const EstoqueModel = getEstoqueModel();
        const filamento = await EstoqueModel.findById(id);
        if (!filamento) {
            alert("Filamento não encontrado!");
            return;
        }
        
        // Preencher o formulário com os dados do filamento
        document.getElementById('estNome').value = filamento.nome;
        document.getElementById('estPreco').value = filamento.precoKg;
        document.getElementById('estGrama').value = filamento.gramas;
        
        // Mudar o texto do botão para indicar que é uma edição
        const btn = document.querySelector('#painel-materiais .btn-main');
        if (btn) {
            btn.textContent = 'Atualizar Filamento';
            btn.onclick = () => atualizarEstoque(id);
        }
        
        // Focar no nome
        document.getElementById('estNome').focus();
    } catch (err) {
        alert("Erro ao carregar filamento: " + err.message);
    }
}

async function atualizarEstoque(id) {
    const nome = document.getElementById('estNome').value;
    const preco = parseFloat(document.getElementById('estPreco').value);
    const peso = parseFloat(document.getElementById('estGrama').value);

    if(!nome || !preco) return alert("Preencha os dados do filamento!");

    try {
        const EstoqueModel = getEstoqueModel();
        await EstoqueModel.findByIdAndUpdate(id, { nome, precoKg: preco, gramas: peso });
        
        // Atualizar o cache de estoque
        const estoqueAtualizado = await EstoqueModel.find({});
        estoqueCache = estoqueAtualizado;
        
        alert("Filamento atualizado com sucesso!");
        
        // Restaurar o botão para o estado original
        const btn = document.querySelector('#painel-materiais .btn-main');
        if (btn) {
            btn.textContent = 'Salvar no MongoDB';
            btn.onclick = adicionarEstoque;
        }
        
        // Limpar o formulário
        resetFormularioEstoque();
        
        // Atualizar a interface
        await atualizarInterface();
    } catch (err) {
        alert("Erro ao atualizar: " + err.message);
    }
}

async function excluirModeloPadrao() {
    const id = document.getElementById('pModeloSelect').value;
    if (!id) return;
    if (confirm("Deseja realmente excluir este modelo padrão?")) {
        try {
            const ModeloModel = getModeloModel();
            await ModeloModel.findByIdAndDelete(id);
            alert("Modelo excluído com sucesso!");
            document.getElementById('pModeloSelect').value = "";
            document.getElementById('btnExcluirModelo').style.display = 'none';
            document.getElementById('pNome').value = "";
            
            const container = document.getElementById('container-filamentos-linhas');
            if (container) {
                container.innerHTML = "";
                adicionarLinhaFilamento();
            }
            
            await carregarListaModelos();
            calcFinanceiro(false);
        } catch (err) {
            alert("Erro ao excluir modelo: " + err.message);
        }
    }
}