/**
 * 3D Manager Pro - Módulo de Importação por URL & Compartilhamento Nativo
 * Suporta MakerWorld (Bambu Handy / Bambu Studio), Printables, Thingiverse
 */

window.UrlImporterModulo = (function () {
    let ultimoResultado = null;
    let perfilSelecionadoIndex = 0;

    /**
     * Retorna a URL base da API
     */
    function getApiBaseUrl() {
        if (window.API_URL) return window.API_URL;
        if (window.API_CONFIG && window.API_CONFIG.BASE_URL) return window.API_CONFIG.BASE_URL;
        if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
            return window.location.origin;
        }
        return 'http://localhost:3847';
    }

    /**
     * Abre o modal de importação por URL
     */
    function abrirModal(urlInicial = '') {
        const modal = document.getElementById('modalImportarUrlOverlay');
        if (!modal) return;

        const input = document.getElementById('urlImportInput');
        const loading = document.getElementById('urlImportLoading');
        const resultContainer = document.getElementById('urlImportResult');
        const errorContainer = document.getElementById('urlImportError');

        if (loading) loading.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';

        if (input) {
            input.value = urlInicial || '';
            setTimeout(() => input.focus(), 200);
        }

        modal.style.display = 'flex';

        // Se uma URL foi passada, busca imediatamente
        if (urlInicial && (urlInicial.includes('http') || urlInicial.match(/\d{4,}/))) {
            buscarModelo(urlInicial);
        }
    }

    /**
     * Fecha o modal de importação
     */
    function fecharModal(e) {
        if (e && e.target && e.target.id !== 'modalImportarUrlOverlay' && !e.target.classList.contains('btn-close-modal')) {
            return;
        }
        const modal = document.getElementById('modalImportarUrlOverlay');
        if (modal) modal.style.display = 'none';
    }

    /**
     * Cola o link da área de transferência do celular/PC
     */
    async function colarDoClipboard() {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                if (text) {
                    const input = document.getElementById('urlImportInput');
                    if (input) input.value = text.trim();
                    if (typeof mostrarToast === 'function') {
                        mostrarToast('Link colado da área de transferência!', 'ok');
                    }
                    buscarModelo(text.trim());
                    return;
                }
            }
            alert('Não foi possível acessar a área de transferência automaticamente. Cole o link no campo de texto.');
        } catch (err) {
            console.warn('[url-importer] Clipboard access denied:', err);
            const input = document.getElementById('urlImportInput');
            if (input) input.focus();
        }
    }

    /**
     * Dispara a busca e análise do modelo via backend API
     */
    async function buscarModelo(urlCustom) {
        const input = document.getElementById('urlImportInput');
        const urlParaBuscar = urlCustom || (input ? input.value : '');

        if (!urlParaBuscar || !urlParaBuscar.trim()) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Por favor, informe um link válido do Bambu Handy / MakerWorld / Printables.', 'alerta');
            } else {
                alert('Informe um link do MakerWorld / Bambu Handy.');
            }
            return;
        }

        const loading = document.getElementById('urlImportLoading');
        const resultContainer = document.getElementById('urlImportResult');
        const errorContainer = document.getElementById('urlImportError');

        if (loading) loading.style.display = 'block';
        if (resultContainer) resultContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';

        try {
            const apiBase = getApiBaseUrl();
            const token = localStorage.getItem('token') || '';
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const resp = await fetch(`${apiBase}/api/models/resolve-url`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ url: urlParaBuscar.trim() })
            });

            const data = await resp.json();

            if (!resp.ok || !data.ok) {
                throw new Error(data.erro || 'Falha ao buscar dados do modelo');
            }

            ultimoResultado = data;
            perfilSelecionadoIndex = data.perfilSelecionadoIndex || 0;

            renderizarResultado(data);

            if (loading) loading.style.display = 'none';
            if (resultContainer) resultContainer.style.display = 'block';

            if (typeof mostrarToast === 'function') {
                mostrarToast(`✨ Modelo "${data.titulo}" carregado com sucesso!`, 'ok');
            }
        } catch (err) {
            console.error('[url-importer] Erro na busca:', err);
            if (loading) loading.style.display = 'none';
            if (errorContainer) {
                errorContainer.style.display = 'block';
                errorContainer.innerHTML = `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px 14px; border-radius: 10px; color: #fca5a5; font-size: 13px;">
                        <strong>⚠️ Não foi possível carregar o modelo:</strong>
                        <p style="margin: 4px 0 0; font-size: 12px;">${err.message}</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Renderiza os dados do modelo e perfis/branches na interface do modal
     */
    function renderizarResultado(data) {
        const perfis = Array.isArray(data.perfis) && data.perfis.length > 0 ? data.perfis : [{
            id: '1',
            titulo: 'Perfil Padrão',
            pesoGramas: data.pesoGramas || 50,
            tempoHoras: data.tempoHoras || 1.5,
            tempoFormatado: data.tempoFormatado || '1h 30m',
            filamentos: data.filamentos || []
        }];

        const perfilAtivo = perfis[perfilSelecionadoIndex] || perfis[0];

        // 1. Cabeçalho do modelo
        const tituloEl = document.getElementById('urlImportTitulo');
        const autorEl = document.getElementById('urlImportAutor');
        const coverEl = document.getElementById('urlImportCover');
        const badgeEl = document.getElementById('urlImportPlatformBadge');

        if (tituloEl) tituloEl.textContent = data.titulo || 'Modelo 3D';
        if (autorEl) autorEl.textContent = `Designer: ${data.autor || 'Comunidade'}`;
        if (coverEl) {
            if (data.coverUrl) {
                coverEl.src = data.coverUrl;
                coverEl.style.display = 'block';
            } else {
                coverEl.style.display = 'none';
            }
        }
        if (badgeEl) {
            badgeEl.textContent = data.nomePlataforma || 'MakerWorld';
        }

        // 2. Seletor de Perfis / Branches (se houver mais de um)
        const perfisContainer = document.getElementById('urlImportPerfisContainer');
        const perfisList = document.getElementById('urlImportPerfisList');

        if (perfisContainer && perfisList) {
            if (perfis.length > 1) {
                perfisContainer.style.display = 'block';
                perfisList.innerHTML = perfis.map((p, idx) => {
                    const ativo = idx === perfilSelecionadoIndex;
                    return `
                        <div class="url-perfil-card ${ativo ? 'ativo' : ''}" onclick="UrlImporterModulo.selecionarPerfil(${idx})">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                                <strong style="font-size:12px;color:${ativo ? 'var(--primary)' : 'var(--text)'};">
                                    ${p.titulo}
                                </strong>
                                ${p.isDefault ? '<span class="badge-tag" style="font-size:9px;background:rgba(16,185,129,0.2);color:#10b981;">Padrão</span>' : ''}
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;font-size:11px;color:var(--text-dim);">
                                <span>⏱️ <b>${p.tempoFormatado}</b></span>
                                <span>⚖️ <b>${p.pesoGramas}g</b></span>
                                <span>🎨 <b>${p.quantidadeCores || p.filamentos?.length || 1} cor(es)</b></span>
                                ${p.precisaAms ? '<span style="color:#f59e0b;">⚡ Requer AMS</span>' : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                perfisContainer.style.display = 'none';
            }
        }

        // 3. Detalhes do perfil ativo (Tempo, Peso, Filamentos)
        const tempoEl = document.getElementById('urlImportTempo');
        const pesoEl = document.getElementById('urlImportPeso');
        const filamentosList = document.getElementById('urlImportFilamentosList');

        if (tempoEl) tempoEl.textContent = perfilAtivo.tempoFormatado;
        if (pesoEl) pesoEl.textContent = `${perfilAtivo.pesoGramas}g`;

        if (filamentosList) {
            const filamentos = Array.isArray(perfilAtivo.filamentos) ? perfilAtivo.filamentos : [];
            if (filamentos.length > 0) {
                filamentosList.innerHTML = filamentos.map(f => `
                    <div class="filament-pill-chip">
                        <span class="color-dot" style="background-color:${f.corHex};"></span>
                        <span style="font-weight:600;">${f.tipo}</span>
                        <span style="color:var(--text-dim);font-size:11px;">(${f.pesoGramas}g)</span>
                    </div>
                `).join('');
            } else {
                filamentosList.innerHTML = `
                    <div class="filament-pill-chip">
                        <span class="color-dot" style="background-color:#10b981;"></span>
                        <span>PLA Padrão (${perfilAtivo.pesoGramas}g)</span>
                    </div>
                `;
            }
        }

        // 4. Placas de impressão / Plate thumbnails (se houver)
        const platesContainer = document.getElementById('urlImportPlatesContainer');
        const platesList = document.getElementById('urlImportPlatesList');
        if (platesContainer && platesList) {
            const plates = Array.isArray(perfilAtivo.plates) ? perfilAtivo.plates : [];
            if (plates.length > 1) {
                platesContainer.style.display = 'block';
                platesList.innerHTML = plates.map(pl => `
                    <div class="plate-mini-card">
                        ${pl.thumbnailUrl ? `<img src="${pl.thumbnailUrl}" class="plate-mini-img" alt="Placa ${pl.index}">` : ''}
                        <div style="padding:4px 6px;">
                            <strong style="font-size:10px;display:block;">${pl.nome}</strong>
                            <span style="font-size:9px;color:var(--text-dim);">${pl.tempoFormatado} • ${pl.pesoGramas}g</span>
                        </div>
                    </div>
                `).join('');
            } else {
                platesContainer.style.display = 'none';
            }
        }
    }

    /**
     * Alterna o perfil selecionado
     */
    function selecionarPerfil(idx) {
        if (!ultimoResultado || !ultimoResultado.perfis || !ultimoResultado.perfis[idx]) return;
        perfilSelecionadoIndex = idx;
        renderizarResultado(ultimoResultado);
    }

    /**
     * Aplica os dados do modelo diretamente na Calculadora de Preços
     */
    function aplicarNaCalculadora() {
        if (!ultimoResultado) return;
        const perfil = ultimoResultado.perfis?.[perfilSelecionadoIndex] || ultimoResultado;

        // 1. Navegar para a aba Calculadora
        if (typeof nav === 'function') {
            const btnCalc = document.querySelector('.nav-item[data-nav="calculadora"]');
            nav('calculadora', btnCalc);
        }

        // 2. Preencher Nome do Item
        const nomeInput = document.getElementById('pNome');
        if (nomeInput) {
            const sufixoPerfil = (ultimoResultado.perfis?.length > 1 && perfil.titulo && perfil.titulo !== 'Padrão') 
                ? ` - ${perfil.titulo}` 
                : '';
            nomeInput.value = `${ultimoResultado.titulo}${sufixoPerfil}`.slice(0, 100);
        }

        // 3. Preencher Tempo (Horas e Minutos)
        const tempoSegundos = perfil.tempoSegundos || (perfil.tempoHoras * 3600) || 3600;
        const horas = Math.floor(tempoSegundos / 3600);
        const minutos = Math.floor((tempoSegundos % 3600) / 60);

        const horasInput = document.getElementById('pTempoHoras');
        const minsInput = document.getElementById('pTempoMinutos');
        if (horasInput) horasInput.value = horas;
        if (minsInput) minsInput.value = minutos;
        if (typeof onTempoInput === 'function') onTempoInput();

        // 4. Preencher Filamentos
        const container = document.getElementById('container-filamentos-linhas');
        if (container) {
            container.innerHTML = '';
            const filamentos = Array.isArray(perfil.filamentos) && perfil.filamentos.length > 0 
                ? perfil.filamentos 
                : [{ tipo: 'PLA', pesoGramas: perfil.pesoGramas || 50, corHex: '#10b981' }];

            filamentos.forEach(f => {
                let matchedEstoqueId = null;
                if (window.estoqueCache && Array.isArray(window.estoqueCache)) {
                    const match = window.estoqueCache.find(e => {
                        const nomeLower = (e.nome || '').toLowerCase();
                        const typeLower = (f.tipo || '').toLowerCase();
                        return nomeLower.includes(typeLower);
                    });
                    if (match) matchedEstoqueId = match._id || match.id;
                }

                if (typeof adicionarLinhaFilamento === 'function') {
                    adicionarLinhaFilamento({
                        peso: f.pesoGramas,
                        precoKg: null,
                        estoqueId: matchedEstoqueId
                    });
                }
            });
        }

        // 5. Atualizar Foto / Capa da Peça se disponível
        const fotoInput = document.getElementById('pFoto');
        if (fotoInput && ultimoResultado.coverUrl) {
            fotoInput.value = ultimoResultado.coverUrl;
            const preview = document.getElementById('pFotoPreview');
            if (preview) {
                preview.src = ultimoResultado.coverUrl;
                preview.style.display = 'block';
            }
        }

        // 6. Recalcular Financeiro
        if (typeof calcFinanceiro === 'function') {
            calcFinanceiro(false);
        }

        fecharModal();

        const msg = `⚡ Modelo "${ultimoResultado.titulo}" aplicado na calculadora! (${perfil.pesoGramas}g, ${perfil.tempoFormatado})`;
        if (typeof mostrarToast === 'function') {
            mostrarToast(msg, 'ok');
        }
    }

    /**
     * Adiciona o modelo diretamente à fila de impressão
     */
    async function adicionarAFila() {
        if (!ultimoResultado) return;
        const perfil = ultimoResultado.perfis?.[perfilSelecionadoIndex] || ultimoResultado;

        if (!window.ImpressorasFilaModulo || typeof window.ImpressorasFilaModulo.abrirModalAdicionar !== 'function') {
            aplicarNaCalculadora();
            return;
        }

        fecharModal();

        // Abre o modal de adicionar à fila já com os valores preenchidos
        window.ImpressorasFilaModulo.abrirModalAdicionar({
            nome: `${ultimoResultado.titulo} (${perfil.titulo || 'Padrão'})`,
            tempoMinutos: Math.round((perfil.tempoSegundos || 3600) / 60),
            pesoGramas: perfil.pesoGramas || 50,
            fotoUrl: ultimoResultado.coverUrl || '',
            origemUrl: ultimoResultado.urlOriginal || ''
        });
    }

    /**
     * Salva o modelo no catálogo de modelos
     */
    async function salvarNoCatalogo() {
        if (!ultimoResultado) return;
        const perfil = ultimoResultado.perfis?.[perfilSelecionadoIndex] || ultimoResultado;

        try {
            const apiBase = getApiBaseUrl();
            const token = localStorage.getItem('token') || '';
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const dadosModelo = {
                nome: ultimoResultado.titulo,
                descricao: ultimoResultado.descricao || `Importado de ${ultimoResultado.nomePlataforma || 'MakerWorld'} (${ultimoResultado.autor})`,
                tempoHoras: perfil.tempoHoras || 1.5,
                pesoGramas: perfil.pesoGramas || 50,
                foto: ultimoResultado.coverUrl || '',
                linkOriginal: ultimoResultado.urlOriginal || '',
                autorOriginal: ultimoResultado.autor || '',
                plataforma: ultimoResultado.plataforma || 'makerworld',
                ativo: true
            };

            const resp = await fetch(`${apiBase}/api/data/modelos`, {
                method: 'POST',
                headers,
                body: JSON.stringify(dadosModelo)
            });

            if (resp.ok) {
                if (typeof mostrarToast === 'function') {
                    mostrarToast(`💾 Modelo "${ultimoResultado.titulo}" salvo no catálogo!`, 'ok');
                } else {
                    alert('Modelo salvo com sucesso no catálogo!');
                }
                fecharModal();
                if (typeof carregarModelosCadastrados === 'function') {
                    carregarModelosCadastrados();
                }
            } else {
                throw new Error('Falha ao salvar modelo no servidor');
            }
        } catch (err) {
            console.error('Erro ao salvar no catálogo:', err);
            alert('Erro ao salvar no catálogo: ' + err.message);
        }
    }

    /**
     * Handler para URLs compartilhadas do Android / Bambu Handy
     */
    function receberUrlCompartilhada(texto) {
        console.log('[url-importer] URL compartilhada recebida do Android:', texto);
        abrirModal(texto);
    }

    // Exporta listener global para o Android Bridge
    window.receberUrlCompartilhada = receberUrlCompartilhada;

    // Verificar se havia URL pendente antes do carregamento do JS
    if (window._pendingSharedUrl) {
        setTimeout(() => {
            receberUrlCompartilhada(window._pendingSharedUrl);
            window._pendingSharedUrl = null;
        }, 800);
    }

    return {
        abrirModal,
        fecharModal,
        colarDoClipboard,
        buscarModelo,
        selecionarPerfil,
        aplicarNaCalculadora,
        adicionarAFila,
        salvarNoCatalogo,
        receberUrlCompartilhada
    };
})();
