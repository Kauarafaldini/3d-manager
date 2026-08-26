/**
 * Módulo de Notificações - 3D Manager Pro
 * Gerencia histórico de alertas da Print Farm (conclusão de peças, estoque crítico, fila, etc.)
 */
const NotificacoesModulo = (function() {
    const STORAGE_KEY = '3d_manager_notifications_v1';
    let notificacoesCache = [];

    function carregarDoStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                notificacoesCache = JSON.parse(raw);
            } else {
                // Notificações de boas-vindas / exemplo se vazio
                notificacoesCache = [
                    {
                        id: 'notif_welcome',
                        tipo: 'sistema',
                        icone: '🚀',
                        titulo: 'Bem-vindo ao 3D Manager Pro!',
                        mensagem: 'Sua central de controle de custos, fila de impressão e telemetria está pronta.',
                        data: new Date().toISOString(),
                        lida: false
                    }
                ];
                salvarNoStorage();
            }
        } catch (e) {
            console.error('[Notificacoes] Erro ao carregar storage:', e);
            notificacoesCache = [];
        }
    }

    function salvarNoStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(notificacoesCache.slice(0, 50))); // guarda até 50
        } catch (e) {
            console.error('[Notificacoes] Erro ao salvar storage:', e);
        }
    }

    function atualizarBadge() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;

        const naoLidas = notificacoesCache.filter(n => !n.lida).length;
        if (naoLidas > 0) {
            badge.style.display = 'flex';
            badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
            badge.classList.add('pulse');
        } else {
            badge.style.display = 'none';
            badge.classList.remove('pulse');
        }
    }

    function emitirBeep() {
        try {
            if (window.AudioContext || window.webkitAudioContext) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch (_) {}
    }

    function adicionarNotificacao({ tipo = 'sistema', titulo, mensagem, icone = '🔔', link = null }) {
        if (!titulo || !mensagem) return;

        // Evitar spam da mesma mensagem recente nos últimos 30 segundos
        const agora = Date.now();
        const duplicada = notificacoesCache.find(n => n.titulo === titulo && (agora - new Date(n.data).getTime()) < 30000);
        if (duplicada) return;

        const nova = {
            id: 'notif_' + agora + '_' + Math.random().toString(36).substr(2, 4),
            tipo,
            icone,
            titulo,
            mensagem,
            link,
            data: new Date().toISOString(),
            lida: false
        };

        notificacoesCache.unshift(nova);
        salvarNoStorage();
        atualizarBadge();
        emitirBeep();

        if (typeof mostrarToast === 'function') {
            mostrarToast(`${icone} ${titulo}`, tipo === 'alerta' ? 'erro' : 'ok');
        }

        // Se o modal estiver aberto, atualiza a lista
        const modal = document.getElementById('notificacoesModalOverlay');
        if (modal && modal.style.display !== 'none') {
            renderizarListaNotificacoes();
        }
    }

    function marcarTodasComoLidas() {
        notificacoesCache.forEach(n => n.lida = true);
        salvarNoStorage();
        atualizarBadge();
        renderizarListaNotificacoes();
    }

    function marcarComoLida(id) {
        const item = notificacoesCache.find(n => n.id === id);
        if (item) {
            item.lida = true;
            salvarNoStorage();
            atualizarBadge();
            renderizarListaNotificacoes();
        }
    }

    function limparNotificacoes() {
        if (!confirm('Deseja limpar todo o histórico de notificações?')) return;
        notificacoesCache = [];
        salvarNoStorage();
        atualizarBadge();
        renderizarListaNotificacoes();
    }

    function formatarTempoRelativo(dataIso) {
        try {
            const data = new Date(dataIso);
            const agora = new Date();
            const diffSegundos = Math.floor((agora - data) / 1000);

            if (diffSegundos < 60) return 'Agora mesmo';
            const diffMinutos = Math.floor(diffSegundos / 60);
            if (diffMinutos < 60) return `${diffMinutos}m atrás`;
            const diffHoras = Math.floor(diffMinutos / 60);
            if (diffHoras < 24) return `${diffHoras}h atrás`;
            const diffDias = Math.floor(diffHoras / 24);
            if (diffDias < 7) return `${diffDias}d atrás`;
            return data.toLocaleDateString('pt-BR');
        } catch (_) {
            return '';
        }
    }

    function renderizarListaNotificacoes() {
        const container = document.getElementById('listaNotificacoesContainer');
        if (!container) return;

        if (!notificacoesCache.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;color:var(--text-dim);">
                    <div style="font-size:36px;margin-bottom:8px;">🔔</div>
                    <b style="font-size:14px;color:var(--text);">Nenhuma notificação por aqui</b>
                    <p style="font-size:12px;margin:4px 0 0;">Você será avisado quando impressões terminarem ou o estoque estiver baixo.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notificacoesCache.map(n => {
            const lidaClass = n.lida ? 'notif-lida' : 'notif-nova';
            return `
                <div class="notif-item ${lidaClass}" onclick="NotificacoesModulo.marcarComoLida('${n.id}')">
                    <div class="notif-icon-col">${n.icone || '🔔'}</div>
                    <div class="notif-content-col">
                        <div class="notif-head">
                            <b class="notif-title">${n.titulo}</b>
                            <span class="notif-time">${formatarTempoRelativo(n.data)}</span>
                        </div>
                        <p class="notif-desc">${n.mensagem}</p>
                    </div>
                    ${!n.lida ? '<span class="notif-unread-dot"></span>' : ''}
                </div>
            `;
        }).join('');
    }

    function abrirModalNotificacoes() {
        const modal = document.getElementById('notificacoesModalOverlay');
        if (!modal) return;
        renderizarListaNotificacoes();
        modal.style.display = 'flex';
    }

    function fecharModalNotificacoes(event) {
        if (event && event.target && event.target.id !== 'notificacoesModalOverlay' && !event.target.classList.contains('btn-close-modal')) {
            return;
        }
        const modal = document.getElementById('notificacoesModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    function init() {
        carregarDoStorage();
        atualizarBadge();
    }

    // Auto-inicializar no carregamento
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        adicionarNotificacao,
        obterNotificacoes: () => notificacoesCache,
        marcarTodasComoLidas,
        marcarComoLida,
        limparNotificacoes,
        atualizarBadge,
        abrirModalNotificacoes,
        fecharModalNotificacoes,
        renderizarListaNotificacoes
    };
})();

if (typeof window !== 'undefined') {
    window.NotificacoesModulo = NotificacoesModulo;
}
