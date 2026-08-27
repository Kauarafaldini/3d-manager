/**
 * 3D Manager Pro — Módulo de Multi-Impressoras & Fila de Produção (Print Farm)
 * Gerencia perfis de impressoras 3D (Watts, desgaste, presets) e fila de impressão inteligente.
 */

window.ImpressorasFilaModulo = (function () {
    const STORAGE_SELECTED_PRINTER = '3dm_selected_printer_id';

    let impressorasCache = [];
    let filaCache = [];
    let carregando = false;

    // Presets populares de impressoras 3D
    const PRESETS_IMPRESSORAS = [
        { nome: 'Bambu Lab P1S', modelo: 'Bambu Lab P1S', potenciaWatts: 160, taxaDesgasteHora: 0.80, custoHoraTrabalho: 1.00 },
        { nome: 'Bambu Lab A1 mini', modelo: 'Bambu Lab A1 mini', potenciaWatts: 60, taxaDesgasteHora: 0.40, custoHoraTrabalho: 1.00 },
        { nome: 'Bambu Lab X1-Carbon', modelo: 'Bambu Lab X1-Carbon', potenciaWatts: 180, taxaDesgasteHora: 1.00, custoHoraTrabalho: 1.00 },
        { nome: 'Bambu Lab A1', modelo: 'Bambu Lab A1', potenciaWatts: 95, taxaDesgasteHora: 0.55, custoHoraTrabalho: 1.00 },
        { nome: 'Creality Ender 3 V3 / SE', modelo: 'Ender 3 V3', potenciaWatts: 120, taxaDesgasteHora: 0.35, custoHoraTrabalho: 1.00 },
        { nome: 'Creality K1 / K1 Max', modelo: 'Creality K1', potenciaWatts: 350, taxaDesgasteHora: 0.90, custoHoraTrabalho: 1.00 },
        { nome: 'Elegoo Neptune 4 Pro', modelo: 'Neptune 4', potenciaWatts: 200, taxaDesgasteHora: 0.50, custoHoraTrabalho: 1.00 }
    ];

    function getSafeImpressoraModel() {
        return window.getImpressoraModel ? window.getImpressoraModel() : null;
    }

    function getSafeFilaModel() {
        return window.getFilaModel ? window.getFilaModel() : null;
    }

    /**
     * Inicialização do módulo
     */
    async function init() {
        await carregarImpressoras();
        await carregarFila();
        preencherSeletorCalculadora();
        renderizarPainelFila();
        renderizarWidgetHome();
    }

    /**
     * Carrega todas as impressoras cadastradas do usuário
     */
    async function carregarImpressoras() {
        try {
            const ImpressoraModel = getSafeImpressoraModel();
            if (!ImpressoraModel) return [];

            impressorasCache = await ImpressoraModel.find({ ativo: { $ne: false } }).sort({ nome: 1 }).lean();

            // Se for a primeira vez e não houver nenhuma impressora, cria presets iniciais padrão
            if (!impressorasCache || impressorasCache.length === 0) {
                console.log('[PrintFarm] Nenhuma impressora encontrada. Criando impressoras padrão...');
                const default1 = await ImpressoraModel.create({
                    nome: 'Bambu Lab P1S #01',
                    modelo: 'Bambu Lab P1S',
                    potenciaWatts: 160,
                    taxaDesgasteHora: 0.80,
                    custoHoraTrabalho: 1.00,
                    status: 'disponivel',
                    ativo: true
                });
                const default2 = await ImpressoraModel.create({
                    nome: 'Bambu Lab A1 mini #01',
                    modelo: 'Bambu Lab A1 mini',
                    potenciaWatts: 60,
                    taxaDesgasteHora: 0.40,
                    custoHoraTrabalho: 1.00,
                    status: 'disponivel',
                    ativo: true
                });
                impressorasCache = [default1, default2];
            }

            preencherSeletorCalculadora();
            return impressorasCache;
        } catch (err) {
            console.error('[PrintFarm] Erro ao carregar impressoras:', err);
            return [];
        }
    }

    /**
     * Carrega os trabalhos na fila de impressão
     */
    async function carregarFila() {
        try {
            const FilaModel = getSafeFilaModel();
            if (!FilaModel) return [];

            filaCache = await FilaModel.find().sort({ ordem: 1, criadoEm: 1 }).lean();
            return filaCache;
        } catch (err) {
            console.error('[PrintFarm] Erro ao carregar fila de impressão:', err);
            return [];
        }
    }

    /**
     * Preenche o <select id="pImpressoraSelect"> na Calculadora de Preços
     */
    function preencherSeletorCalculadora() {
        const select = document.getElementById('pImpressoraSelect');
        if (!select) return;

        const valorAtual = select.value || localStorage.getItem(STORAGE_SELECTED_PRINTER) || '';
        select.innerHTML = '<option value="">-- Padrão Manual (Valores Personalizados) --</option>';

        impressorasCache.forEach(imp => {
            const id = imp._id ? String(imp._id) : '';
            const statusIcon = imp.status === 'imprimindo' ? '⚡' : (imp.status === 'manutencao' ? '🔧' : '🟢');
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${statusIcon} ${imp.nome} (${imp.potenciaWatts || 150}W · R$ ${(imp.taxaDesgasteHora || 0).toFixed(2)}/h)`;
            select.appendChild(opt);
        });

        if (valorAtual && impressorasCache.some(i => String(i._id) === valorAtual)) {
            select.value = valorAtual;
            aplicarPerfilImpressoraCalculadora(valorAtual);
        } else if (impressorasCache.length > 0 && !valorAtual) {
            // Seleciona a primeira impressora por conveniência
            select.value = String(impressorasCache[0]._id);
            aplicarPerfilImpressoraCalculadora(String(impressorasCache[0]._id));
        }
    }

    /**
     * Ao mudar a impressora na calculadora, preenche automaticamente os campos de consumo e desgaste
     */
    function aoMudarImpressoraCalculadora() {
        const select = document.getElementById('pImpressoraSelect');
        if (!select) return;
        const id = select.value;
        if (id) {
            localStorage.setItem(STORAGE_SELECTED_PRINTER, id);
            aplicarPerfilImpressoraCalculadora(id);
        } else {
            localStorage.removeItem(STORAGE_SELECTED_PRINTER);
            atualizarInfoImpressoraCalculadora(null);
        }
    }

    function aplicarPerfilImpressoraCalculadora(id) {
        const imp = impressorasCache.find(i => String(i._id) === String(id));
        if (!imp) return;

        const inputPotencia = document.getElementById('pPotencia');
        const inputDesgaste = document.getElementById('pDesgaste');
        const inputTrabalhoHora = document.getElementById('pTrabalhoHora');

        if (inputPotencia && imp.potenciaWatts != null) {
            inputPotencia.value = imp.potenciaWatts;
        }
        if (inputDesgaste && imp.taxaDesgasteHora != null) {
            inputDesgaste.value = Number(imp.taxaDesgasteHora).toFixed(2);
        }
        if (inputTrabalhoHora && imp.custoHoraTrabalho != null && imp.custoHoraTrabalho > 0) {
            inputTrabalhoHora.value = Number(imp.custoHoraTrabalho).toFixed(2);
        }

        atualizarInfoImpressoraCalculadora(imp);

        if (typeof window.calcFinanceiro === 'function') {
            window.calcFinanceiro(false);
        }
    }

    function atualizarInfoImpressoraCalculadora(imp) {
        const infoEl = document.getElementById('pImpressoraInfo');
        if (!infoEl) return;
        if (!imp) {
            infoEl.innerHTML = 'Preenchimento manual de potência e taxa de desgaste.';
            return;
        }
        infoEl.innerHTML = `✅ Perfil ativo: <b>${imp.nome}</b> (${imp.potenciaWatts || 150}W · Desgaste R$ ${(imp.taxaDesgasteHora || 0).toFixed(2)}/h · Mão de obra R$ ${(imp.custoHoraTrabalho || 1).toFixed(2)}/h)`;
    }

    /**
     * Retorna a impressora atualmente selecionada na calculadora
     */
    function obterImpressoraSelecionadaCalculadora() {
        const select = document.getElementById('pImpressoraSelect');
        if (!select || !select.value) return null;
        return impressorasCache.find(i => String(i._id) === String(select.value)) || null;
    }

    /**
     * Modal: Gerenciar Impressoras
     */
    function abrirModalGerenciar() {
        const modal = document.getElementById('impressorasModalOverlay');
        if (modal) {
            modal.style.display = 'flex';
            renderizarListaModalImpressoras();
        }
    }

    function fecharModalGerenciar(e) {
        if (e && e.target && e.target.id !== 'impressorasModalOverlay' && !e.target.classList.contains('btn-close-modal')) {
            return;
        }
        const modal = document.getElementById('impressorasModalOverlay');
        if (modal) modal.style.display = 'none';
        limparFormularioImpressora();
    }

    function aplicarPresetImpressora(index) {
        const preset = PRESETS_IMPRESSORAS[index];
        if (!preset) return;
        document.getElementById('impFormNome').value = `${preset.nome} #${impressorasCache.length + 1}`;
        document.getElementById('impFormModelo').value = preset.modelo;
        document.getElementById('impFormWatts').value = preset.potenciaWatts;
        document.getElementById('impFormDesgaste').value = preset.taxaDesgasteHora.toFixed(2);
        document.getElementById('impFormTrabalho').value = preset.custoHoraTrabalho.toFixed(2);
    }

    function renderizarListaModalImpressoras() {
        const container = document.getElementById('modalListaImpressoras');
        if (!container) return;

        if (!impressorasCache.length) {
            container.innerHTML = '<p class="empty-msg">Nenhuma impressora cadastrada.</p>';
            return;
        }

        container.innerHTML = impressorasCache.map(imp => {
            const id = String(imp._id);
            const statusClass = imp.status === 'imprimindo' ? 'badge-imprimindo' : (imp.status === 'manutencao' ? 'badge-manutencao' : 'badge-disponivel');
            const statusLabel = imp.status === 'imprimindo' ? '⚡ Imprimindo' : (imp.status === 'manutencao' ? '🔧 Manutenção' : '🟢 Disponível');

            return `
                <div class="farm-printer-item" id="imp-item-${id}">
                    <div class="farm-printer-info">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <strong style="font-size:14px;color:var(--text);">${imp.nome}</strong>
                            <span class="status-pill ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="farm-printer-specs">
                            <span>Modelo: <b>${imp.modelo || '3D FDM'}</b></span> · 
                            <span>Potência: <b>${imp.potenciaWatts || 150}W</b></span> · 
                            <span>Desgaste: <b>R$ ${(imp.taxaDesgasteHora || 0).toFixed(2)}/h</b></span>
                        </div>
                    </div>
                    <div class="farm-printer-actions">
                        <button class="btn-secondary" style="padding:6px 10px;font-size:11px;" onclick="ImpressorasFilaModulo.editarImpressora('${id}')" title="Editar">✏️</button>
                        <button class="btn-delete-row" onclick="ImpressorasFilaModulo.excluirImpressora('${id}')" title="Excluir">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function aoMudarTipoConexao() {
        const tipo = document.getElementById('impFormTipoConexao')?.value || 'manual';
        const bloco = document.getElementById('impBlocoTelemetria');
        if (!bloco) return;

        if (tipo === 'manual') {
            bloco.style.display = 'none';
        } else {
            bloco.style.display = 'block';
            const portaInput = document.getElementById('impFormPorta');
            if (portaInput && !portaInput.value) {
                if (tipo === 'bambu') portaInput.value = '8883';
                else if (tipo === 'klipper') portaInput.value = '7125';
                else if (tipo === 'octoprint') portaInput.value = '5000';
            }
        }
    }

    async function testarConexaoFormulario() {
        const protocol = document.getElementById('impFormTipoConexao')?.value || 'manual';
        const ip = document.getElementById('impFormIp')?.value?.trim();
        const port = parseInt(document.getElementById('impFormPorta')?.value, 10);
        const serial = document.getElementById('impFormSerial')?.value?.trim();
        const accessCode = document.getElementById('impFormAccessCode')?.value?.trim();
        const nome = document.getElementById('impFormNome')?.value?.trim() || 'Impressora 3D';

        if (!ip && protocol !== 'manual') {
            if (typeof mostrarToast === 'function') mostrarToast('Informe o IP da impressora para testar', 'erro');
            return;
        }

        if (typeof mostrarToast === 'function') mostrarToast(`⏳ Testando conexão via ${protocol.toUpperCase()}...`, 'ok');

        try {
            const res = await window.httpClient.post('/api/printers/connect', {
                protocol,
                ip,
                port,
                serial: serial || 'TEST_SN',
                accessCode,
                apiKey: accessCode,
                nome
            });

            if (res && (res.ok || res.status === 'connected')) {
                if (typeof mostrarToast === 'function') {
                    mostrarToast(`✅ Conexão bem-sucedida com ${nome}!`, 'ok');
                } else {
                    alert('Conectado com sucesso!');
                }
            } else {
                if (typeof mostrarToast === 'function') {
                    mostrarToast(res?.message || '⚠️ Falha ao conectar. Verifique IP e porta.', 'erro');
                } else {
                    alert('Falha ao conectar: ' + (res?.message || 'verifique dados'));
                }
            }
        } catch (err) {
            console.error('Erro ao testar conexão:', err);
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Erro ao testar: ${err.message}`, 'erro');
            }
        }
    }

    function limparFormularioImpressora() {
        const idInput = document.getElementById('impFormId');
        if (idInput) idInput.value = '';
        const fNome = document.getElementById('impFormNome');
        if (fNome) fNome.value = '';
        const fModelo = document.getElementById('impFormModelo');
        if (fModelo) fModelo.value = '';
        const fTipo = document.getElementById('impFormTipoConexao');
        if (fTipo) fTipo.value = 'manual';
        const fIp = document.getElementById('impFormIp');
        if (fIp) fIp.value = '';
        const fPorta = document.getElementById('impFormPorta');
        if (fPorta) fPorta.value = '';
        const fSerial = document.getElementById('impFormSerial');
        if (fSerial) fSerial.value = '';
        const fAccess = document.getElementById('impFormAccessCode');
        if (fAccess) fAccess.value = '';
        const fWatts = document.getElementById('impFormWatts');
        if (fWatts) fWatts.value = '150';
        const fDesgaste = document.getElementById('impFormDesgaste');
        if (fDesgaste) fDesgaste.value = '0.50';
        const fTrabalho = document.getElementById('impFormTrabalho');
        if (fTrabalho) fTrabalho.value = '1.00';
        const btnSalvar = document.getElementById('btnSalvarImpressora');
        if (btnSalvar) btnSalvar.textContent = 'Adicionar Impressora';

        aoMudarTipoConexao();
    }

    function editarImpressora(id) {
        const imp = impressorasCache.find(i => String(i._id) === String(id));
        if (!imp) return;

        document.getElementById('impFormId').value = String(imp._id);
        document.getElementById('impFormNome').value = imp.nome || '';
        document.getElementById('impFormModelo').value = imp.modelo || '';
        document.getElementById('impFormWatts').value = imp.potenciaWatts || 150;
        document.getElementById('impFormDesgaste').value = (imp.taxaDesgasteHora || 0).toFixed(2);
        document.getElementById('impFormTrabalho').value = (imp.custoHoraTrabalho || 1).toFixed(2);

        if (document.getElementById('impFormTipoConexao')) {
            document.getElementById('impFormTipoConexao').value = imp.tipoConexao || 'manual';
        }
        if (document.getElementById('impFormIp')) document.getElementById('impFormIp').value = imp.ip || '';
        if (document.getElementById('impFormSerial')) document.getElementById('impFormSerial').value = imp.serial || '';
        if (document.getElementById('impFormAccessCode')) document.getElementById('impFormAccessCode').value = imp.accessCode || '';

        document.getElementById('btnSalvarImpressora').textContent = 'Salvar Alterações';
        aoMudarTipoConexao();
        document.getElementById('impFormNome').focus();
    }

    async function salvarImpressora() {
        const id = document.getElementById('impFormId')?.value?.trim();
        const nome = document.getElementById('impFormNome')?.value?.trim();
        const modelo = document.getElementById('impFormModelo')?.value?.trim() || 'Impressora 3D';
        const tipoConexao = document.getElementById('impFormTipoConexao')?.value || 'manual';
        const ip = document.getElementById('impFormIp')?.value?.trim() || '';
        const serial = document.getElementById('impFormSerial')?.value?.trim() || '';
        const accessCode = document.getElementById('impFormAccessCode')?.value?.trim() || '';
        const potenciaWatts = parseFloat(document.getElementById('impFormWatts')?.value) || 150;
        const taxaDesgasteHora = parseFloat(document.getElementById('impFormDesgaste')?.value) || 0;
        const custoHoraTrabalho = parseFloat(document.getElementById('impFormTrabalho')?.value) || 1.00;

        if (!nome) {
            if (typeof mostrarToast === 'function') mostrarToast('Informe o nome da impressora', 'erro');
            return;
        }

        try {
            const ImpressoraModel = getSafeImpressoraModel();
            if (!ImpressoraModel) return;

            const dadosImpressora = {
                nome,
                modelo,
                tipoConexao,
                ip,
                serial,
                accessCode,
                potenciaWatts,
                taxaDesgasteHora,
                custoHoraTrabalho
            };

            if (id) {
                await ImpressoraModel.findByIdAndUpdate(id, dadosImpressora);
                if (typeof mostrarToast === 'function') mostrarToast(`Impressora "${nome}" atualizada!`, 'ok');
            } else {
                await ImpressoraModel.create({
                    ...dadosImpressora,
                    status: 'disponivel',
                    ativo: true
                });
                if (typeof mostrarToast === 'function') mostrarToast(`Impressora "${nome}" adicionada!`, 'ok');
            }

            limparFormularioImpressora();
            await carregarImpressoras();
            renderizarListaModalImpressoras();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao salvar impressora:', err);
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao salvar impressora: ' + err.message, 'erro');
        }
    }

    async function excluirImpressora(id) {
        const imp = impressorasCache.find(i => String(i._id) === String(id));
        const nome = imp ? imp.nome : 'esta impressora';

        if (!confirm(`Deseja realmente excluir ${nome}?`)) return;

        try {
            const ImpressoraModel = getSafeImpressoraModel();
            if (!ImpressoraModel) return;

            await ImpressoraModel.findByIdAndDelete(id);
            if (typeof mostrarToast === 'function') mostrarToast(`Impressora "${nome}" excluída`, 'ok');

            await carregarImpressoras();
            renderizarListaModalImpressoras();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao excluir impressora:', err);
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao excluir: ' + err.message, 'erro');
        }
    }

    /**
     * Enfileirar um Orçamento (Pré-Venda) para uma Impressora
     */
    function abrirModalEnfileirarPreVenda(vendaId) {
        const modal = document.getElementById('enfileirarModalOverlay');
        if (!modal) return;

        document.getElementById('enfVendaId').value = vendaId;

        const select = document.getElementById('enfImpressoraSelect');
        if (select) {
            select.innerHTML = '';
            impressorasCache.forEach(imp => {
                const id = String(imp._id);
                const filaDaMaquina = filaCache.filter(f => String(f.impressoraId) === id && f.status !== 'concluido' && f.status !== 'cancelado');
                const tempoTotalMinutos = filaDaMaquina.reduce((acc, curr) => acc + ((Number(curr.tempoEstimadoHoras) || 0) * 60), 0);
                const horas = Math.floor(tempoTotalMinutos / 60);
                const mins = Math.round(tempoTotalMinutos % 60);
                const filaTexto = filaDaMaquina.length > 0 ? `${filaDaMaquina.length} item(ns) · ${horas}h ${mins}m na fila` : 'Fila vazia / Disponível';

                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = `${imp.nome} — [${filaTexto}]`;
                select.appendChild(opt);
            });
        }

        modal.style.display = 'flex';
    }

    function fecharModalEnfileirar(e) {
        if (e && e.target && e.target.id !== 'enfileirarModalOverlay' && !e.target.classList.contains('btn-close-modal')) {
            return;
        }
        const modal = document.getElementById('enfileirarModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    async function confirmarEnfileiramentoPreVenda() {
        const vendaId = document.getElementById('enfVendaId')?.value;
        const impressoraId = document.getElementById('enfImpressoraSelect')?.value;

        if (!vendaId || !impressoraId) {
            if (typeof mostrarToast === 'function') mostrarToast('Selecione uma impressora', 'erro');
            return;
        }

        try {
            const VendaModel = window.getSafeVendaModel ? window.getSafeVendaModel() : (window.getVendaModel ? window.getVendaModel() : null);
            const FilaModel = getSafeFilaModel();
            const ImpressoraModel = getSafeImpressoraModel();

            if (!VendaModel || !FilaModel) return;

            const venda = await VendaModel.findById(vendaId);
            const impressora = impressorasCache.find(i => String(i._id) === String(impressoraId));

            if (!venda || !impressora) {
                if (typeof mostrarToast === 'function') mostrarToast('Orçamento ou Impressora não encontrados', 'erro');
                return;
            }

            // Tempo estimado da venda
            let tempoHoras = 1;
            if (venda.detalheCustos && venda.detalheCustos.tempoHoras) {
                tempoHoras = Number(venda.detalheCustos.tempoHoras) || 1;
            }

            // Calcula peso total
            let pesoTotal = 0;
            if (venda.filamentosUsados && Array.isArray(venda.filamentosUsados)) {
                pesoTotal = venda.filamentosUsados.reduce((acc, curr) => acc + (Number(curr.peso) || 0), 0);
            }

            // Próxima ordem na fila da máquina
            const filaDaMaquina = filaCache.filter(f => String(f.impressoraId) === String(impressoraId) && f.status !== 'concluido' && f.status !== 'cancelado');
            const proximaOrdem = filaDaMaquina.length + 1;

            // Se a impressora estiver livre e não houver itens na fila, já sugere iniciar
            const statusInicial = filaDaMaquina.length === 0 && impressora.status === 'disponivel' ? 'pendente' : 'pendente';

            await FilaModel.create({
                impressoraId: String(impressora._id),
                impressoraNome: impressora.nome,
                nomeItem: venda.nome || 'Trabalho 3D',
                sku: venda.sku || '',
                pedidoId: venda.pedidoId || '',
                vendaId: String(venda._id),
                tempoEstimadoHoras: tempoHoras,
                pesoTotalGramas: pesoTotal,
                filamentosUsados: venda.filamentosUsados || [],
                custosExtras: venda.custosExtras || [],
                quantidade: venda.quantidade || 1,
                ordem: proximaOrdem,
                status: statusInicial
            });

            if (typeof mostrarToast === 'function') {
                mostrarToast(`✨ "${venda.nome}" enviado para a fila de ${impressora.nome}!`, 'ok');
            }

            fecharModalEnfileirar();
            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();

            // Alterna para a visualização da fila
            if (typeof window.subNavTerminal === 'function') {
                window.subNavTerminal('fila');
            }
        } catch (err) {
            console.error('Erro ao enfileirar pré-venda:', err);
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao enfileirar: ' + err.message, 'erro');
        }
    }

    /**
     * Adicionar trabalho manual avulso à fila
     */
    function abrirModalTrabalhoAvulso(impressoraId = '') {
        const modal = document.getElementById('trabalhoAvulsoModalOverlay');
        if (!modal) return;

        const select = document.getElementById('tabAvulsoImpressora');
        if (select) {
            select.innerHTML = '';
            impressorasCache.forEach(imp => {
                const opt = document.createElement('option');
                opt.value = String(imp._id);
                opt.textContent = imp.nome;
                if (impressoraId && String(imp._id) === String(impressoraId)) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
        }

        modal.style.display = 'flex';
    }

    function fecharModalTrabalhoAvulso(e) {
        if (e && e.target && e.target.id !== 'trabalhoAvulsoModalOverlay' && !e.target.classList.contains('btn-close-modal')) {
            return;
        }
        const modal = document.getElementById('trabalhoAvulsoModalOverlay');
        if (modal) modal.style.display = 'none';
        document.getElementById('tabAvulsoNome').value = '';
        document.getElementById('tabAvulsoHoras').value = '2';
        document.getElementById('tabAvulsoMinutos').value = '0';
        document.getElementById('tabAvulsoPeso').value = '50';
    }

    async function salvarTrabalhoAvulso() {
        const impressoraId = document.getElementById('tabAvulsoImpressora')?.value;
        const nomeItem = document.getElementById('tabAvulsoNome')?.value?.trim();
        const horas = parseInt(document.getElementById('tabAvulsoHoras')?.value, 10) || 0;
        const minutos = parseInt(document.getElementById('tabAvulsoMinutos')?.value, 10) || 0;
        const pesoTotalGramas = parseFloat(document.getElementById('tabAvulsoPeso')?.value) || 0;
        const observacoes = document.getElementById('tabAvulsoObs')?.value?.trim() || '';

        if (!nomeItem || !impressoraId) {
            if (typeof mostrarToast === 'function') mostrarToast('Preencha o nome do trabalho', 'erro');
            return;
        }

        const tempoEstimadoHoras = Math.max(0.1, horas + (minutos / 60));
        const impressora = impressorasCache.find(i => String(i._id) === String(impressoraId));

        try {
            const FilaModel = getSafeFilaModel();
            if (!FilaModel) return;

            const filaDaMaquina = filaCache.filter(f => String(f.impressoraId) === String(impressoraId) && f.status !== 'concluido' && f.status !== 'cancelado');

            await FilaModel.create({
                impressoraId,
                impressoraNome: impressora ? impressora.nome : 'Impressora 3D',
                nomeItem,
                tempoEstimadoHoras,
                pesoTotalGramas,
                ordem: filaDaMaquina.length + 1,
                status: 'pendente',
                observacoes
            });

            if (typeof mostrarToast === 'function') mostrarToast(`Trabalho "${nomeItem}" adicionado à fila!`, 'ok');

            fecharModalTrabalhoAvulso();
            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao adicionar trabalho avulso:', err);
            if (typeof mostrarToast === 'function') mostrarToast('Erro: ' + err.message, 'erro');
        }
    }

    /**
     * Ações dos itens da fila: Iniciar, Pausar, Concluir, Mover, Cancelar
     */
    async function iniciarTrabalho(filaId) {
        try {
            const FilaModel = getSafeFilaModel();
            const ImpressoraModel = getSafeImpressoraModel();
            if (!FilaModel) return;

            const trabalho = await FilaModel.findById(filaId);
            if (!trabalho) return;

            // Atualiza trabalho
            await FilaModel.findByIdAndUpdate(filaId, {
                status: 'imprimindo',
                iniciadoEm: new Date()
            });

            // Atualiza status da impressora
            if (trabalho.impressoraId && ImpressoraModel) {
                await ImpressoraModel.findByIdAndUpdate(trabalho.impressoraId, {
                    status: 'imprimindo'
                });
            }

            if (typeof mostrarToast === 'function') {
                mostrarToast(`⚡ Impressão de "${trabalho.nomeItem}" iniciada!`, 'ok');
            }

            await carregarImpressoras();
            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao iniciar trabalho:', err);
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao iniciar: ' + err.message, 'erro');
        }
    }

    async function pausarTrabalho(filaId) {
        try {
            const FilaModel = getSafeFilaModel();
            const ImpressoraModel = getSafeImpressoraModel();
            if (!FilaModel) return;

            const trabalho = await FilaModel.findById(filaId);
            if (!trabalho) return;

            await FilaModel.findByIdAndUpdate(filaId, { status: 'pausado' });

            if (trabalho.impressoraId && ImpressoraModel) {
                await ImpressoraModel.findByIdAndUpdate(trabalho.impressoraId, { status: 'pausada' });
            }

            if (typeof mostrarToast === 'function') mostrarToast(`⏸️ "${trabalho.nomeItem}" pausado.`, 'ok');

            await carregarImpressoras();
            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao pausar:', err);
        }
    }

    async function concluirTrabalho(filaId) {
        if (!confirm('Deseja marcar este trabalho como concluído e dar baixa nos insumos/estoque?')) return;

        try {
            const FilaModel = getSafeFilaModel();
            const ImpressoraModel = getSafeImpressoraModel();
            const EstoqueModel = window.getSafeEstoqueModel ? window.getSafeEstoqueModel() : (window.getEstoqueModel ? window.getEstoqueModel() : null);
            const VendaModel = window.getSafeVendaModel ? window.getSafeVendaModel() : (window.getVendaModel ? window.getVendaModel() : null);

            if (!FilaModel) return;

            const trabalho = await FilaModel.findById(filaId);
            if (!trabalho) return;

            // 1. Marca trabalho como concluído
            await FilaModel.findByIdAndUpdate(filaId, {
                status: 'concluido',
                concluidoEm: new Date()
            });

            // 2. Se tiver filamentos usados vinculados, dá baixa no estoque
            if (trabalho.filamentosUsados && trabalho.filamentosUsados.length > 0 && EstoqueModel) {
                for (const f of trabalho.filamentosUsados) {
                    if (!f.estoqueId) continue;
                    const filamento = await EstoqueModel.findById(f.estoqueId);
                    if (filamento) {
                        const novaQtd = Math.max(0, (Number(filamento.gramas) || 0) - (Number(f.peso) || 0));
                        await EstoqueModel.findByIdAndUpdate(f.estoqueId, { gramas: novaQtd });
                    }
                }
            }

            // 3. Se tiver custos extras vinculados
            if (trabalho.custosExtras && trabalho.custosExtras.length > 0 && typeof window.baixarEstoqueCustosExtras === 'function') {
                await window.baixarEstoqueCustosExtras(trabalho.custosExtras);
            }

            // 4. Se tiver venda vinculada, finaliza a venda
            if (trabalho.vendaId && VendaModel) {
                await VendaModel.findByIdAndUpdate(trabalho.vendaId, { status: 'concluida' });
            }

            // 5. Atualiza status da impressora (se não tiver outro trabalho imprimindo, volta para 'disponivel')
            if (trabalho.impressoraId && ImpressoraModel) {
                const outrosImprimindo = filaCache.some(f => String(f._id) !== String(filaId) && String(f.impressoraId) === String(trabalho.impressoraId) && f.status === 'imprimindo');
                if (!outrosImprimindo) {
                    await ImpressoraModel.findByIdAndUpdate(trabalho.impressoraId, { status: 'disponivel' });
                }
            }

            if (typeof mostrarToast === 'function') {
                mostrarToast(`🎉 Trabalho "${trabalho.nomeItem}" concluído com sucesso! Insumos baixados.`, 'ok');
            }

            if (typeof NotificacoesModulo !== 'undefined') {
                NotificacoesModulo.adicionarNotificacao({
                    tipo: 'impressao_concluida',
                    icone: '✅',
                    titulo: `Impressão Concluída: ${trabalho.nomeItem}`,
                    mensagem: `Peça "${trabalho.nomeItem}" finalizada com sucesso. Insumos baixados no estoque.`
                });
            }

            await carregarImpressoras();
            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();

            if (typeof window.atualizarOverviewHome === 'function') await window.atualizarOverviewHome();
            if (typeof window.atualizarRelatorioFinanceiro === 'function') await window.atualizarRelatorioFinanceiro();
            if (typeof window.renderizarPreVendas === 'function') await window.renderizarPreVendas();
            if (typeof window.carregarEstoqueProdutos === 'function') await window.carregarEstoqueProdutos();
        } catch (err) {
            console.error('Erro ao concluir trabalho:', err);
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao concluir: ' + err.message, 'erro');
        }
    }

    async function cancelarTrabalho(filaId) {
        if (!confirm('Deseja remover este trabalho da fila?')) return;

        try {
            const FilaModel = getSafeFilaModel();
            const ImpressoraModel = getSafeImpressoraModel();
            if (!FilaModel) return;

            const trabalho = await FilaModel.findById(filaId);
            if (trabalho && trabalho.status === 'imprimindo' && trabalho.impressoraId && ImpressoraModel) {
                await ImpressoraModel.findByIdAndUpdate(trabalho.impressoraId, { status: 'disponivel' });
            }

            await FilaModel.findByIdAndDelete(filaId);

            if (typeof mostrarToast === 'function') mostrarToast('Trabalho removido da fila.', 'ok');

            await carregarImpressoras();
            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao cancelar trabalho:', err);
        }
    }

    async function moverOrdem(filaId, direcao) {
        const itemIndex = filaCache.findIndex(f => String(f._id) === String(filaId));
        if (itemIndex === -1) return;

        const item = filaCache[itemIndex];
        const filaMesmaMaquina = filaCache.filter(f => String(f.impressoraId) === String(item.impressoraId) && f.status !== 'concluido' && f.status !== 'cancelado');
        const posLocal = filaMesmaMaquina.findIndex(f => String(f._id) === String(filaId));

        if (direcao === 'cima' && posLocal > 0) {
            const anterior = filaMesmaMaquina[posLocal - 1];
            const tempOrdem = item.ordem;
            item.ordem = anterior.ordem;
            anterior.ordem = tempOrdem;

            const FilaModel = getSafeFilaModel();
            if (FilaModel) {
                await FilaModel.findByIdAndUpdate(String(item._id), { ordem: item.ordem });
                await FilaModel.findByIdAndUpdate(String(anterior._id), { ordem: anterior.ordem });
            }
        } else if (direcao === 'baixo' && posLocal < filaMesmaMaquina.length - 1) {
            const proximo = filaMesmaMaquina[posLocal + 1];
            const tempOrdem = item.ordem;
            item.ordem = proximo.ordem;
            proximo.ordem = tempOrdem;

            const FilaModel = getSafeFilaModel();
            if (FilaModel) {
                await FilaModel.findByIdAndUpdate(String(item._id), { ordem: item.ordem });
                await FilaModel.findByIdAndUpdate(String(proximo._id), { ordem: proximo.ordem });
            }
        }

        await carregarFila();
        renderizarPainelFila();
    }

    async function transferirImpressora(filaId) {
        const item = filaCache.find(f => String(f._id) === String(filaId));
        if (!item) return;

        const outrasImpressoras = impressorasCache.filter(i => String(i._id) !== String(item.impressoraId));
        if (outrasImpressoras.length === 0) {
            if (typeof mostrarToast === 'function') mostrarToast('Você só tem uma impressora cadastrada.', 'erro');
            return;
        }

        const nomes = outrasImpressoras.map((imp, idx) => `${idx + 1}. ${imp.nome}`).join('\n');
        const escolha = prompt(`Transferir "${item.nomeItem}" para qual máquina?\n\n${nomes}\n\nDigite o número da máquina:`);
        if (!escolha) return;

        const num = parseInt(escolha, 10);
        if (isNaN(num) || num < 1 || num > outrasImpressoras.length) {
            alert('Opção inválida.');
            return;
        }

        const novaImp = outrasImpressoras[num - 1];
        try {
            const FilaModel = getSafeFilaModel();
            if (!FilaModel) return;

            const filaNovaMaquina = filaCache.filter(f => String(f.impressoraId) === String(novaImp._id) && f.status !== 'concluido' && f.status !== 'cancelado');

            await FilaModel.findByIdAndUpdate(filaId, {
                impressoraId: String(novaImp._id),
                impressoraNome: novaImp.nome,
                ordem: filaNovaMaquina.length + 1
            });

            if (typeof mostrarToast === 'function') {
                mostrarToast(`Transferido para ${novaImp.nome}!`, 'ok');
            }

            await carregarFila();
            renderizarPainelFila();
            renderizarWidgetHome();
        } catch (err) {
            console.error('Erro ao transferir:', err);
        }
    }

    /**
     * Formatação de tempo em Horas e Minutos
     */
    function formatarTempoHoras(horasDecimais) {
        const totalMin = Math.round((Number(horasDecimais) || 0) * 60);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h === 0) return `${m}min`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    /**
     * Renderização do Painel Completo da Print Farm (na sub-aba de Vendas/Terminal)
     */
    function renderizarPainelFila() {
        const container = document.getElementById('termFilaView');
        if (!container) return;

        if (!impressorasCache.length) {
            container.innerHTML = `
                <div class="card-glass" style="text-align:center;padding:30px;">
                    <div style="font-size:36px;margin-bottom:8px;">🖨️</div>
                    <h3 style="margin:0 0 6px;">Nenhuma impressora configurada</h3>
                    <p style="font-size:12px;color:var(--text-dim);margin:0 0 16px;">Cadastre suas máquinas para gerenciar a fila de impressão da sua Print Farm.</p>
                    <button class="btn-main" onclick="ImpressorasFilaModulo.abrirModalGerenciar()" style="margin:0 auto;width:auto;">⚙️ Cadastrar Impressoras</button>
                </div>
            `;
            return;
        }

        const totalTrabalhosAtivos = filaCache.filter(f => f.status !== 'concluido' && f.status !== 'cancelado').length;
        const totalImprimindo = impressorasCache.filter(i => i.status === 'imprimindo').length;

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
                <div>
                    <h4 style="margin:0;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px;">
                        <span>🖨️ Fila de Produção</span>
                        <span class="badge-count">${totalTrabalhosAtivos} na fila</span>
                    </h4>
                    <span style="font-size:11px;color:var(--text-dim);">${impressorasCache.length} máquinas cadastradas · ${totalImprimindo} imprimindo</span>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn-secondary" style="padding:6px 12px;font-size:11px;" onclick="ImpressorasFilaModulo.abrirModalTrabalhoAvulso()">➕ Adicionar Trabalho</button>
                    <button class="btn-secondary" style="padding:6px 12px;font-size:11px;" onclick="ImpressorasFilaModulo.abrirModalGerenciar()">⚙️ Máquinas</button>
                </div>
            </div>

            <div class="farm-grid-impressoras">
        `;

        impressorasCache.forEach(imp => {
            const id = String(imp._id);
            const itensMaquina = filaCache.filter(f => String(f.impressoraId) === id && f.status !== 'concluido' && f.status !== 'cancelado');
            const trabalhoAtivo = itensMaquina.find(f => f.status === 'imprimindo');
            const itensFila = itensMaquina.filter(f => f.status !== 'imprimindo');

            const tempoTotalMinutos = itensMaquina.reduce((acc, curr) => acc + ((Number(curr.tempoEstimadoHoras) || 0) * 60), 0);
            const tempoFilaFormatado = formatarTempoHoras(tempoTotalMinutos / 60);

            const isImprimindo = imp.status === 'imprimindo' || !!trabalhoAtivo;
            const statusCardClass = isImprimindo ? 'farm-card-imprimindo' : (imp.status === 'manutencao' ? 'farm-card-manutencao' : 'farm-card-disponivel');
            const statusBadgeText = isImprimindo ? '⚡ Imprimindo' : (imp.status === 'manutencao' ? '🔧 Manutenção' : '🟢 Disponível');
            const statusBadgeClass = isImprimindo ? 'badge-imprimindo' : (imp.status === 'manutencao' ? 'badge-manutencao' : 'badge-disponivel');

            html += `
                <div class="farm-printer-card ${statusCardClass}">
                    <div class="farm-card-header">
                        <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <strong style="font-size:14px;color:var(--text);">${imp.nome}</strong>
                                <span class="status-pill ${statusBadgeClass}">${statusBadgeText}</span>
                            </div>
                            <span class="farm-card-sub">${imp.modelo || 'FDM'} · ${imp.potenciaWatts || 150}W · R$ ${(imp.taxaDesgasteHora || 0).toFixed(2)}/h desgaste</span>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:10px;color:var(--text-dim);display:block;">Tempo Total</span>
                            <strong style="font-size:13px;color:var(--primary);">${tempoFilaFormatado}</strong>
                        </div>
                    </div>

                    <!-- TRABALHO EM EXECUÇÃO -->
                    ${trabalhoAtivo ? `
                        <div class="farm-active-job-box">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                                <div>
                                    <span class="job-tag-active">▶️ EM IMPRESSÃO</span>
                                    <strong style="display:block;font-size:13px;color:var(--text);margin-top:2px;">${trabalhoAtivo.nomeItem}</strong>
                                    <span style="font-size:10px;color:var(--text-dim);">
                                        Tempo: <b>${formatarTempoHoras(trabalhoAtivo.tempoEstimadoHoras)}</b> ${trabalhoAtivo.pesoTotalGramas ? `· ${trabalhoAtivo.pesoTotalGramas}g` : ''}
                                        ${trabalhoAtivo.pedidoId ? `· Pedido #${trabalhoAtivo.pedidoId}` : ''}
                                    </span>
                                </div>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn-main" style="padding:5px 10px;font-size:11px;background:var(--success);margin:0;" onclick="ImpressorasFilaModulo.concluirTrabalho('${String(trabalhoAtivo._id)}')">✅ Concluir</button>
                                    <button class="btn-secondary" style="padding:5px 8px;font-size:11px;" onclick="ImpressorasFilaModulo.pausarTrabalho('${String(trabalhoAtivo._id)}')">⏸️</button>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="farm-idle-box">
                            <span>Mesa livre. Pronta para iniciar o próximo item da fila.</span>
                        </div>
                    `}

                    <!-- ITENS NA FILA DE ESPERA -->
                    <div class="farm-queue-list">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 4px;">
                            <small style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">
                                Fila de Espera (${itensFila.length})
                            </small>
                            <button type="button" class="btn-link-farm" onclick="ImpressorasFilaModulo.abrirModalTrabalhoAvulso('${id}')">+ Adicionar</button>
                        </div>

                        ${itensFila.length === 0 ? `
                            <p style="font-size:11px;color:var(--text-dim);font-style:italic;margin:6px 0;">Nenhum item aguardando nesta máquina.</p>
                        ` : `
                            <div class="farm-queue-items">
                                ${itensFila.map((item, idx) => `
                                    <div class="farm-queue-row">
                                        <div class="queue-order-badge">${idx + 1}</div>
                                        <div class="queue-info">
                                            <strong style="font-size:12px;color:var(--text);display:block;">${item.nomeItem}</strong>
                                            <span style="font-size:10px;color:var(--text-dim);">
                                                ⏱️ ${formatarTempoHoras(item.tempoEstimadoHoras)} ${item.pesoTotalGramas ? `· ${item.pesoTotalGramas}g` : ''}
                                                ${item.pedidoId ? `· #${item.pedidoId}` : ''}
                                            </span>
                                        </div>
                                        <div class="queue-actions">
                                            <button class="btn-action-farm" onclick="ImpressorasFilaModulo.iniciarTrabalho('${String(item._id)}')" title="Iniciar Impressão Agora">▶️ Iniciar</button>
                                            <button class="btn-action-icon" onclick="ImpressorasFilaModulo.moverOrdem('${String(item._id)}', 'cima')" title="Subir prioridade">⬆️</button>
                                            <button class="btn-action-icon" onclick="ImpressorasFilaModulo.moverOrdem('${String(item._id)}', 'baixo')" title="Descer prioridade">⬇️</button>
                                            <button class="btn-action-icon" onclick="ImpressorasFilaModulo.transferirImpressora('${String(item._id)}')" title="Mover para outra impressora">🔀</button>
                                            <button class="btn-action-icon btn-danger-icon" onclick="ImpressorasFilaModulo.cancelarTrabalho('${String(item._id)}')" title="Remover da fila">🗑️</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    /**
     * Renderização do Widget Compacto da Print Farm na tela Home
     */
    function renderizarWidgetHome() {
        const container = document.getElementById('farmHomeWidget');
        if (!container) return;

        if (!impressorasCache.length) {
            container.innerHTML = '';
            return;
        }

        const totalTrabalhosAtivos = filaCache.filter(f => f.status !== 'concluido' && f.status !== 'cancelado').length;
        const totalImprimindo = impressorasCache.filter(i => i.status === 'imprimindo').length;

        let html = `
            <div class="card-glass" style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:16px;">🖨️</span>
                        <strong style="font-size:13px;color:var(--text);">Print Farm & Fila de Produção</strong>
                    </div>
                    <button class="btn-secondary" style="padding:4px 10px;font-size:10px;" onclick="window.nav('terminal', document.querySelector('.nav-item[data-nav=terminal]')); window.subNavTerminal('fila');">Ver Fila Completa ➔</button>
                </div>

                <div class="farm-home-summary-grid">
                    <div class="mini-stat">
                        <span>Máquinas</span>
                        <strong>${impressorasCache.length}</strong>
                    </div>
                    <div class="mini-stat mini-stat-destaque">
                        <span>Em Impressão</span>
                        <strong style="color:var(--primary);">${totalImprimindo}</strong>
                    </div>
                    <div class="mini-stat">
                        <span>Itens na Fila</span>
                        <strong style="color:var(--warning);">${totalTrabalhosAtivos}</strong>
                    </div>
                </div>

                <div class="farm-home-printers-list" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
        `;

        impressorasCache.forEach(imp => {
            const id = String(imp._id);
            const itens = filaCache.filter(f => String(f.impressoraId) === id && f.status !== 'concluido' && f.status !== 'cancelado');
            const trabalhoAtivo = itens.find(f => f.status === 'imprimindo');
            const statusPillClass = imp.status === 'imprimindo' ? 'badge-imprimindo' : 'badge-disponivel';
            const statusText = imp.status === 'imprimindo' ? '⚡ Imprimindo' : '🟢 Livre';

            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-secondary);padding:8px 12px;border-radius:10px;border:1px solid var(--border-subtle);">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="status-pill ${statusPillClass}">${statusText}</span>
                        <div>
                            <b style="font-size:12px;color:var(--text);">${imp.nome}</b>
                            <span style="font-size:10px;color:var(--text-dim);display:block;">
                                ${trabalhoAtivo ? `Atual: <b>${trabalhoAtivo.nomeItem}</b>` : `${itens.length} trabalho(s) aguardando`}
                            </span>
                        </div>
                    </div>
                    <span style="font-size:11px;font-weight:700;color:var(--primary);">
                        ${formatarTempoHoras(itens.reduce((acc, c) => acc + ((Number(c.tempoEstimadoHoras) || 0) * 60), 0) / 60)}
                    </span>
                </div>
            `;
        });

        html += `</div></div>`;
        container.innerHTML = html;
    }

    return {
        init,
        carregarImpressoras,
        carregarFila,
        preencherSeletorCalculadora,
        aoMudarImpressoraCalculadora,
        obterImpressoraSelecionadaCalculadora,
        obterImpressoras: () => impressorasCache,
        abrirModalGerenciar,
        fecharModalGerenciar,
        aplicarPresetImpressora,
        salvarImpressora,
        editarImpressora,
        excluirImpressora,
        aoMudarTipoConexao,
        testarConexaoFormulario,
        abrirModalEnfileirarPreVenda,
        fecharModalEnfileirar,
        confirmarEnfileiramentoPreVenda,
        abrirModalTrabalhoAvulso,
        fecharModalTrabalhoAvulso,
        salvarTrabalhoAvulso,
        iniciarTrabalho,
        pausarTrabalho,
        concluirTrabalho,
        cancelarTrabalho,
        moverOrdem,
        transferirImpressora,
        renderizarPainelFila,
        renderizarWidgetHome,
        formatarTempoHoras
    };
})();
