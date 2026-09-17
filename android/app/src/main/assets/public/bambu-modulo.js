/**
 * 3D Manager Pro — Módulo Bambu Lab (MQTT Local / Telemetria em Tempo Real)
 * Compatível com Electron, Web e Dispositivos Móveis
 */

(function () {
    const STORAGE_KEY = '3dm_bambu_config';
    const PRINTERS_LIST_KEY = '3dm_bambu_printers';

    let currentConfig = {
        nome: 'Bambu Lab P1S',
        ip: '',
        serial: '',
        accessCode: '',
        autoConnect: true,
        useSimulator: false
    };

    let telemetryState = {
        connected: false,
        isSimulator: false,
        state: 'OFFLINE', // IDLE, RUNNING, PAUSE, FINISH, FAILED, OFFLINE
        percent: 0,
        remainingMinutes: 0,
        remainingFormatted: '--',
        layer: 0,
        totalLayers: 0,
        nozzleTemp: 0,
        nozzleTarget: 0,
        bedTemp: 0,
        bedTarget: 0,
        chamberTemp: 0,
        fileName: '',
        chamberLight: 'off',
        speedLevel: 2,
        ams: [],
        vtTray: null
    };

    let pollInterval = null;
    let isConnecting = false;
    let lastKnownFinishState = false;

    // Inicialização
    function init() {
        carregarConfiguracao();
        renderizarMonitor();
        if (currentConfig.autoConnect && (currentConfig.serial || currentConfig.useSimulator)) {
            conectarBambu();
        }
    }

    function carregarConfiguracao() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                currentConfig = { ...currentConfig, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('[bambu] Erro ao carregar configurações locais:', e);
        }
    }

    function salvarConfiguracao(cfg) {
        currentConfig = { ...currentConfig, ...cfg };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
        } catch (e) {
            console.warn('[bambu] Erro ao salvar configurações:', e);
        }
    }

    /**
     * Conectar à impressora Bambu Lab
     */
    async function conectarBambu() {
        if (isConnecting) return;
        isConnecting = true;
        atualizarUIStatusConexao('Conectando...');

        try {
            // Tenta via API backend
            if (window.apiClient) {
                const res = await window.apiClient.post('/api/bambu/connect', {
                    nome: currentConfig.nome,
                    ip: currentConfig.ip,
                    serial: currentConfig.serial,
                    accessCode: currentConfig.accessCode,
                    useSimulator: currentConfig.useSimulator
                });

                if (res && res.ok) {
                    telemetryState.connected = true;
                    if (res.printer) Object.assign(telemetryState, res.printer);
                    iniciarPolling();
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`Bambu Lab [${currentConfig.nome}] conectada!`, 'ok');
                    }
                } else {
                    // Se falhar e estiver em modo simulador ou cliente standalone
                    if (currentConfig.useSimulator) {
                        iniciarSimuladorLocal();
                    } else {
                        telemetryState.connected = false;
                        telemetryState.state = 'OFFLINE';
                        if (typeof mostrarToast === 'function') {
                            mostrarToast(res?.message || 'Falha ao conectar na Bambu Lab. Verifique IP e Código.', 'erro');
                        }
                    }
                }
            } else if (currentConfig.useSimulator) {
                iniciarSimuladorLocal();
            }
        } catch (err) {
            console.warn('[bambu] Erro ao conectar:', err);
            if (currentConfig.useSimulator) {
                iniciarSimuladorLocal();
            } else {
                telemetryState.connected = false;
                telemetryState.state = 'OFFLINE';
            }
        } finally {
            isConnecting = false;
            renderizarMonitor();
        }
    }

    function iniciarPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(atualizarTelemetria, 3000);
        atualizarTelemetria();
    }

    async function atualizarTelemetria() {
        if (!telemetryState.connected && !currentConfig.useSimulator) return;

        try {
            if (window.apiClient && currentConfig.serial) {
                const data = await window.apiClient.get(`/api/bambu/status?serial=${encodeURIComponent(currentConfig.serial)}`);
                if (data && data.connected !== undefined) {
                    const prevState = telemetryState.state;
                    Object.assign(telemetryState, data);

                    // Detecta conclusão de impressão
                    if (prevState === 'RUNNING' && (data.state === 'FINISH' || data.percent >= 100)) {
                        onImpressaoConcluida();
                    }
                }
            }
        } catch (err) {
            console.warn('[bambu] Falha no polling de telemetria:', err);
        }

        renderizarMonitor();
    }

    function iniciarSimuladorLocal() {
        telemetryState = {
            connected: true,
            isSimulator: true,
            state: 'RUNNING',
            percent: 45,
            remainingMinutes: 72,
            remainingFormatted: '1h 12m',
            layer: 168,
            totalLayers: 350,
            nozzleTemp: 220,
            nozzleTarget: 220,
            bedTemp: 60,
            bedTarget: 60,
            chamberTemp: 35,
            fileName: 'Suporte_Gamer_Bambu.3mf',
            chamberLight: 'on',
            speedLevel: 2,
            ams: [
                { id: 'A1', color: '#06b6d4', type: 'PLA Basic', subBrand: 'Cyan Bambu', remain: 82 },
                { id: 'A2', color: '#10b981', type: 'PLA Matte', subBrand: 'Verde Mint', remain: 45 },
                { id: 'A3', color: '#f59e0b', type: 'PETG Basic', subBrand: 'Laranja Solar', remain: 90 },
                { id: 'A4', color: '#3b82f6', type: 'PLA Silk', subBrand: 'Azul Real', remain: 30 }
            ],
            vtTray: null
        };

        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => {
            if (telemetryState.state === 'RUNNING') {
                telemetryState.percent = Math.min(100, telemetryState.percent + 1);
                telemetryState.layer = Math.min(telemetryState.totalLayers, telemetryState.layer + 1);
                telemetryState.remainingMinutes = Math.max(0, telemetryState.remainingMinutes - 1);
                telemetryState.remainingFormatted = `${Math.floor(telemetryState.remainingMinutes / 60)}h ${telemetryState.remainingMinutes % 60}m`;
                telemetryState.nozzleTemp = 219 + Math.floor(Math.random() * 3);

                if (telemetryState.percent >= 100) {
                    telemetryState.state = 'FINISH';
                    onImpressaoConcluida();
                }
            }
            renderizarMonitor();
        }, 4000);

        if (typeof mostrarToast === 'function') {
            mostrarToast('Simulador Bambu Lab ativado!', 'ok');
        }
    }

    /**
     * Enviar comando para a impressora
     */
    async function enviarComando(command, mode) {
        try {
            if (telemetryState.isSimulator) {
                if (command === 'chamber_light') {
                    telemetryState.chamberLight = mode || (telemetryState.chamberLight === 'on' ? 'off' : 'on');
                }
                if (command === 'pause') telemetryState.state = 'PAUSE';
                if (command === 'resume') telemetryState.state = 'RUNNING';
                renderizarMonitor();
                return;
            }

            if (window.apiClient && currentConfig.serial) {
                await window.apiClient.post('/api/bambu/command', {
                    serial: currentConfig.serial,
                    command,
                    mode
                });
                atualizarTelemetria();
            }
        } catch (err) {
            console.error('[bambu] Erro ao enviar comando:', err);
            if (typeof mostrarToast === 'function') {
                mostrarToast('Erro ao enviar comando para a impressora', 'erro');
            }
        }
    }

    function toggleLuzCamara() {
        const nextMode = telemetryState.chamberLight === 'on' ? 'off' : 'on';
        enviarComando('chamber_light', nextMode);
    }

    /**
     * Notificação ao concluir impressão
     */
    function onImpressaoConcluida() {
        if (lastKnownFinishState) return;
        lastKnownFinishState = true;

        if (typeof mostrarToast === 'function') {
            mostrarToast(`🎉 Impressão "${telemetryState.fileName || 'Trabalho'}" concluída na Bambu Lab!`, 'ok');
        }

        const banner = document.getElementById('bambuFinishBanner');
        if (banner) {
            banner.style.display = 'flex';
        }
    }

    /**
     * Registrar produção com base no trabalho concluído da Bambu
     */
    function registrarProducaoDaBambu() {
        if (typeof nav === 'function') {
            nav('estoque', document.querySelector('.nav-item[data-nav=estoque]'));
        }
        if (typeof subNavEstoque === 'function') {
            subNavEstoque('produtos');
        }
        const cardProd = document.querySelector('.estoque-producao-card');
        if (cardProd) {
            cardProd.scrollIntoView({ behavior: 'smooth' });
            cardProd.style.boxShadow = '0 0 20px var(--primary-glow)';
            setTimeout(() => { cardProd.style.boxShadow = ''; }, 3000);
        }
        const banner = document.getElementById('bambuFinishBanner');
        if (banner) banner.style.display = 'none';
        lastKnownFinishState = false;
    }

    function fecharBannerConclusao() {
        const banner = document.getElementById('bambuFinishBanner');
        if (banner) banner.style.display = 'none';
        lastKnownFinishState = false;
    }

    /**
     * Renderização do Monitor Bambu Lab
     */
    function renderizarMonitor() {
        const container = document.getElementById('bambuMonitorWidget');
        if (!container) return;

        const isOnline = telemetryState.connected;
        const state = telemetryState.state || 'OFFLINE';

        const stateLabels = {
            RUNNING: { text: 'Imprimindo', class: 'status-running', icon: '⚡' },
            PREPARE: { text: 'Aquecendo', class: 'status-running', icon: '🔥' },
            PAUSE: { text: 'Pausada', class: 'status-paused', icon: '⏸️' },
            FINISH: { text: 'Concluída', class: 'status-finish', icon: '✅' },
            FAILED: { text: 'Erro / Falha', class: 'status-error', icon: '⚠️' },
            IDLE: { text: 'Ociosa / Pronta', class: 'status-idle', icon: '💤' },
            OFFLINE: { text: 'Desconectada', class: 'status-offline', icon: '🔌' }
        };

        const currentBadge = stateLabels[state] || stateLabels.OFFLINE;

        // Renderiza Slots do AMS
        let amsHtml = '';
        if (telemetryState.ams && telemetryState.ams.length > 0) {
            amsHtml = `
                <div class="bambu-ams-container">
                    <div class="bambu-ams-label">
                        <span>🧵 AMS — Slots de Filamento</span>
                        <small style="color:var(--text-dim);font-size:10px;">${telemetryState.ams.length} carretéis</small>
                    </div>
                    <div class="bambu-ams-grid">
                        ${telemetryState.ams.map(tray => `
                            <div class="bambu-ams-tray" title="${tray.subBrand || tray.type}">
                                <div class="bambu-tray-color" style="background:${tray.color};">
                                    <span class="bambu-tray-slot-id">${tray.id}</span>
                                </div>
                                <div class="bambu-tray-info">
                                    <strong>${tray.type || 'PLA'}</strong>
                                    <small>${tray.subBrand || 'Filamento'}</small>
                                </div>
                                ${tray.remain >= 0 ? `
                                    <div class="bambu-tray-level">
                                        <div class="bambu-tray-level-bar" style="width:${tray.remain}%;background:${tray.color};"></div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (isOnline) {
            amsHtml = `
                <div class="bambu-ams-container">
                    <div class="bambu-ams-label"><span>🧵 Carretel Externo</span></div>
                    <div style="font-size:12px;color:var(--text-dim);padding:8px 0;">Impressora sem AMS ou em carretel avulso.</div>
                </div>
            `;
        }

        const isLightOn = telemetryState.chamberLight === 'on';

        container.innerHTML = `
            <div class="card-glass bambu-card">
                <div class="bambu-header">
                    <div class="bambu-title-box">
                        <div class="bambu-logo-icon">🐼</div>
                        <div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <h3 style="margin:0;font-size:15px;color:var(--text);">${currentConfig.nome || 'Bambu Lab'}</h3>
                                ${telemetryState.isSimulator ? '<span class="bambu-sim-badge">Simulador</span>' : ''}
                            </div>
                            <p style="margin:2px 0 0;font-size:11px;color:var(--text-dim);">
                                ${isOnline ? (telemetryState.fileName || 'Nenhum trabalho ativo') : 'Aguardando conexão Wi-Fi local'}
                            </p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="bambu-badge ${currentBadge.class}">
                            ${currentBadge.icon} ${currentBadge.text}
                        </span>
                        <button class="btn-compact-icon" onclick="BambuModulo.abrirModalConfig()" title="Configurar Conexão">⚙️</button>
                    </div>
                </div>

                <!-- BANNER DE CONCLUSÃO -->
                <div id="bambuFinishBanner" class="bambu-finish-banner" style="${state === 'FINISH' ? 'display:flex;' : 'display:none;'}">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:20px;">🎉</span>
                        <div>
                            <strong style="font-size:12px;color:white;">Impressão Concluída!</strong>
                            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.85);">Deseja registrar este item no estoque?</p>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button class="btn-main" style="padding:6px 12px;font-size:11px;margin:0;" onclick="BambuModulo.registrarProducaoDaBambu()">📦 Dar Entrada</button>
                        <button class="btn-secondary" style="padding:6px 10px;font-size:11px;background:rgba(0,0,0,0.2);border:none;color:white;" onclick="BambuModulo.fecharBannerConclusao()">✕</button>
                    </div>
                </div>

                ${isOnline ? `
                    <!-- PROGRESSO & TEMPOS -->
                    <div class="bambu-progress-section">
                        <div class="bambu-progress-top">
                            <div class="bambu-progress-stat">
                                <span class="bambu-stat-label">Progresso</span>
                                <strong class="bambu-stat-val" style="color:var(--primary);font-size:22px;">${telemetryState.percent}%</strong>
                            </div>
                            <div class="bambu-progress-stat">
                                <span class="bambu-stat-label">Tempo Restante</span>
                                <strong class="bambu-stat-val">${telemetryState.remainingFormatted}</strong>
                            </div>
                            <div class="bambu-progress-stat">
                                <span class="bambu-stat-label">Camadas</span>
                                <strong class="bambu-stat-val">${telemetryState.layer} / ${telemetryState.totalLayers || '-'}</strong>
                            </div>
                        </div>
                        <div class="bambu-progress-bar-bg">
                            <div class="bambu-progress-bar-fill" style="width:${telemetryState.percent}%;"></div>
                        </div>
                    </div>

                    <!-- TEMPERATURAS & TELEMETRIA TÉRMICA -->
                    <div class="bambu-metrics-grid">
                        <div class="bambu-metric-card">
                            <div class="bambu-metric-icon">🔥</div>
                            <div>
                                <span class="bambu-metric-name">Bico (Hotend)</span>
                                <strong>${telemetryState.nozzleTemp}°C <small>/ ${telemetryState.nozzleTarget}°C</small></strong>
                            </div>
                        </div>
                        <div class="bambu-metric-card">
                            <div class="bambu-metric-icon">♨️</div>
                            <div>
                                <span class="bambu-metric-name">Mesa (Heatbed)</span>
                                <strong>${telemetryState.bedTemp}°C <small>/ ${telemetryState.bedTarget}°C</small></strong>
                            </div>
                        </div>
                        <div class="bambu-metric-card">
                            <div class="bambu-metric-icon">🌡️</div>
                            <div>
                                <span class="bambu-metric-name">Câmara</span>
                                <strong>${telemetryState.chamberTemp || 28}°C</strong>
                            </div>
                        </div>
                    </div>

                    <!-- SLOTS DO AMS -->
                    ${amsHtml}

                    <!-- AÇÕES RÁPIDAS DA IMPRESSORA -->
                    <div class="bambu-actions-row">
                        <button class="btn-secondary bambu-btn-action ${isLightOn ? 'btn-light-active' : ''}" onclick="BambuModulo.toggleLuzCamara()">
                            💡 Luz Câmara: <b>${isLightOn ? 'Ligada' : 'Desligada'}</b>
                        </button>
                        <button class="btn-secondary bambu-btn-action" onclick="BambuModulo.atualizarTelemetria()">
                            🔄 Atualizar Telemetria
                        </button>
                    </div>
                ` : `
                    <div class="bambu-empty-state">
                        <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted);">
                            Conecte sua Bambu Lab (X1, P1S, A1, A1 mini) para ver telemetria ao vivo, temperaturas e AMS.
                        </p>
                        <div style="display:flex;gap:10px;justify-content:center;">
                            <button class="btn-main" style="margin:0;padding:10px 18px;font-size:12px;" onclick="BambuModulo.abrirModalConfig()">
                                ⚡ Conectar Impressora
                            </button>
                            <button class="btn-secondary" style="padding:10px 16px;font-size:12px;" onclick="BambuModulo.iniciarSimuladorLocal()">
                                🎮 Testar com Simulador
                            </button>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    function atualizarUIStatusConexao(msg) {
        const badge = document.querySelector('.bambu-badge');
        if (badge) {
            badge.className = 'bambu-badge status-running';
            badge.innerHTML = `⏳ ${msg}`;
        }
    }

    /**
     * Modal de Configuração
     */
    function abrirModalConfig() {
        const modal = document.getElementById('bambuModalOverlay');
        if (!modal) return;

        document.getElementById('bambuCfgNome').value = currentConfig.nome || 'Bambu Lab P1S';
        document.getElementById('bambuCfgIp').value = currentConfig.ip || '';
        document.getElementById('bambuCfgSerial').value = currentConfig.serial || '';
        document.getElementById('bambuCfgAccessCode').value = currentConfig.accessCode || '';
        document.getElementById('bambuCfgSimulator').checked = !!currentConfig.useSimulator;

        modal.style.display = 'flex';
    }

    function fecharModalConfig(e) {
        if (e && e.target !== e.currentTarget) return;
        const modal = document.getElementById('bambuModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    async function salvarEConectarModal() {
        const nome = document.getElementById('bambuCfgNome').value.trim() || 'Bambu Lab';
        const ip = document.getElementById('bambuCfgIp').value.trim();
        const serial = document.getElementById('bambuCfgSerial').value.trim().toUpperCase();
        const accessCode = document.getElementById('bambuCfgAccessCode').value.trim();
        const useSimulator = document.getElementById('bambuCfgSimulator').checked;

        salvarConfiguracao({
            nome,
            ip,
            serial,
            accessCode,
            useSimulator
        });

        const modal = document.getElementById('bambuModalOverlay');
        if (modal) modal.style.display = 'none';

        if (useSimulator) {
            iniciarSimuladorLocal();
        } else {
            await conectarBambu();
        }
    }

    // Expor métodos para a janela global
    window.BambuModulo = {
        init,
        conectarBambu,
        atualizarTelemetria,
        toggleLuzCamara,
        enviarComando,
        iniciarSimuladorLocal,
        getConfig: () => ({ ...currentConfig }),
        abrirModalConfig,
        fecharModalConfig,
        salvarEConectarModal,
        registrarProducaoDaBambu,
        fecharBannerConclusao,
        renderizarMonitor
    };

    // Auto-iniciar após carregamento do DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }
})();
