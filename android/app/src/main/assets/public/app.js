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
        controle: 'Controle Financeiro',
        financeiro: 'Calculadora de Preços',
        terminal: 'Terminal de Vendas',
        'estoque-produtos': 'Estoque de Produtos',
        estoque: 'Estoque de Matéria-Prima'
    };
    document.getElementById('tab-title').innerText = titles[tab] || tab;

    if (tab === 'financeiro' || tab === 'estoque' || tab === 'controle') {
        garantirCamposEditaveis();
    }

    if (tab === 'controle') {
        if (typeof carregarCustos === 'function') carregarCustos();
        if (typeof subNavControle === 'function') subNavControle('relatorio');
    }

    if (tab === 'financeiro') {
        if (typeof carregarCustos === 'function') carregarCustos();
        atualizarOpcoesCanais();
        const container = document.getElementById('container-filamentos-linhas');
        if (container && container.children.length === 0) {
            adicionarLinhaFilamento();
        }
        atualizarTempoResumo();
        calcFinanceiro(false);
    }

    if (tab === 'terminal') {
        if (typeof carregarEstoqueProdutos === 'function') carregarEstoqueProdutos();
        if (typeof renderizarUltimasVendas === 'function') renderizarUltimasVendas();
        limparTerminal();
    }

    if (tab === 'estoque-produtos') {
        if (typeof carregarEstoqueProdutos === 'function') carregarEstoqueProdutos();
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
}

function atualizarOpcoesCanal() {
    const canal = document.getElementById('pCanal').value;
    document.getElementById('opcoes-shopee').style.display = canal === 'shopee' ? 'block' : 'none';
    document.getElementById('opcoes-ml').style.display = canal === 'ml' ? 'block' : 'none';
    atualizarInterfaceCanais();
    calcFinanceiro(false);
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
        selectHtml += `<option value="${idEstoque(e)}">${e.nome} (${e.gramas.toFixed(0)}g rest.)</option>`;
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

async function salvarModeloPadrao() {
    if (!bancoOnline()) {
        return alert("Servidor offline.");
    }

    const nome = document.getElementById('pNome').value;
    if(!nome) return alert("Dê um nome ao item para salvar como modelo padrão.");

    const dados = calcFinanceiro();
    const ModeloModel = getModeloModel();

    const existente = modelosCache.find(m => m.nome.toLowerCase() === nome.toLowerCase());
    if (existente) {
        if (!confirm(`Já existe um modelo com o nome "${nome}". Deseja substituí-lo?`)) {
            return;
        }
        try {
            await ModeloModel.findByIdAndUpdate(existente._id, {
                nome,
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
                venda: dados.venda
            });
            await carregarListaModelos();
            if (typeof mostrarToast === 'function') mostrarToast('Modelo atualizado!');
            if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
            return;
        } catch (err) {
            alert("Erro ao atualizar modelo: " + err.message);
            if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
            return;
        }
    }

    try {
        const modelo = new ModeloModel({
            nome,
            sku: document.getElementById('pSKU').value?.trim() || '',
            estoque: 0,
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
            venda: dados.venda
        });

        await modelo.save();
        await carregarListaModelos();
        if (typeof mostrarToast === 'function') mostrarToast('Modelo salvo!');
        if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
    } catch (err) {
        alert("Erro ao salvar modelo: " + err.message);
        if (typeof reativarFormularios === 'function') reativarFormularios('#pNome');
    }
}

async function carregarListaModelos() {
    try {
        const ModeloModel = getModeloModel();
        modelosCache = await ModeloModel.find({});
        const select = document.getElementById('pModeloSelect');
        if (!select) return;
        select.innerHTML = '<option value="">-- Novo Item Personalizado --</option>';
        modelosCache.forEach(m => {
            select.innerHTML += `<option value="${m._id}">${m.nome}</option>`;
        });
    } catch (e) {
        console.error("Erro ao carregar lista de modelos:", e);
    }
}

function carregarModeloPadrao() {
    const id = document.getElementById('pModeloSelect').value;
    const btnExcluir = document.getElementById('btnExcluirModelo');

    if(!id) {
        if (btnExcluir) btnExcluir.style.display = 'none';
        return; 
    }
    
    if (btnExcluir) btnExcluir.style.display = 'block';

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

        const brutoTotal = vendas.reduce((acc, v) => acc + v.bruto, 0);
        const lucroTotal = vendas.reduce((acc, v) => acc + v.lucro, 0);
        const custoTotal = vendas.reduce((acc, v) => acc + v.custo, 0);

        document.getElementById('dashBruto').innerText = `R$ ${brutoTotal.toFixed(2)}`;
        document.getElementById('dashLucroTotal').innerText = `R$ ${lucroTotal.toFixed(2)}`;
        document.getElementById('dashCustosTotal').innerText = `R$ ${custoTotal.toFixed(2)}`;

        const listaV = document.getElementById('lista-vendas-recente');
        if (vendas.length > 0) {
            listaV.innerHTML = vendas.map(v => `
                <div class="item-row">
                    <div class="item-info">
                        <b>${v.nome}</b>
                        <span>${v.canal.toUpperCase()} | Bruto: R$ ${v.bruto.toFixed(2)} | Custo: R$ ${v.custo.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="item-val">+ R$ ${v.lucro.toFixed(2)}</div>
                        <button class="btn-delete-row" onclick="excluirVenda('${v._id}')" title="Excluir Lançamento">🗑️</button>
                    </div>
                </div>
            `).join('');
        } else {
            listaV.innerHTML = '<p class="empty-msg">Nenhuma venda registrada no banco.</p>';
        }

        const listaE = document.getElementById('lista-estoque');
        listaE.innerHTML = estoque.map(e => `
            <div class="item-row" style="border-left-color: #10b981">
                <div class="item-info">
                    <b>${e.nome}</b>
                    <span>${e.gramas.toFixed(0)}g disponíveis</span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="item-val" style="color: #94a3b8">R$ ${e.precoKg.toFixed(2)}/kg</div>
                    <button class="btn-delete-row" onclick="excluirEstoque('${e._id}')" title="Excluir Filamento">🗑️</button>
                </div>
            </div>
        `).join('');

        if (document.querySelectorAll('.linha-filamento').length > 0) {
            atualizarTodosSelectsFilamento();
        }
        if (typeof atualizarTodosSelectsCustoExtra === 'function') {
            atualizarTodosSelectsCustoExtra();
        }
        if (document.getElementById('sec-controle')?.style.display !== 'none') {
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
            select.innerHTML += `<option value="${idEstoque(e)}">${e.nome} (${e.gramas.toFixed(0)}g rest.)</option>`;
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