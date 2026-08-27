/**
 * Template HTML/CSS da Página Pública de Rastreio de Pedidos
 * Servida pelo Express em /status/:pedidoId
 */

function renderTrackingPage(data) {
    const {
        pedidoId = 'PED-000',
        nomeCliente = 'Cliente',
        nomeItem = 'Item 3D Personalizado',
        quantidade = 1,
        statusFila = '', // pendente, imprimindo, pausado, concluido, entregue, cancelado
        statusVenda = 'orcamento', // orcamento, pre_venda, aprovado, em_producao, acabamento, pronto, enviado, concluida
        percentual = 0,
        tempoRestante = '',
        impressoraNome = 'Impressora 3D',
        dataCriacao = new Date().toLocaleDateString('pt-BR'),
        filamentos = [],
        codigoRastreio = '',
        observacoes = '',
        whatsappEmpresa = '',
        nomeEmpresa = '3D Manager Studio'
    } = data || {};

    // Mapeamento dos passos da Timeline
    // 0: Orçamento / Proposta Gerada (Aguardando Aprovação)
    // 1: Pedido Aprovado
    // 2: Na Fila de Produção
    // 3: Em Impressão
    // 4: Acabamento & Controle de Qualidade
    // 5: Pronto / Enviado / Entregue
    let currentStep = 0;
    let stepDescription = 'Proposta comercial registrada. Aguardando aprovação do cliente para início da produção.';
    let statusBadgeText = 'Orçamento / Aguardando Aprovação';
    let statusBadgeColor = '#f59e0b';

    const statusNorm = String(statusVenda || '').toLowerCase();
    const filaNorm = String(statusFila || '').toLowerCase();

    if (statusNorm === 'cancelado') {
        currentStep = -1;
        stepDescription = 'Este pedido foi cancelado.';
        statusBadgeText = 'Cancelado';
        statusBadgeColor = '#ef4444';
    } else if (statusNorm === 'concluida' || statusNorm === 'entregue') {
        currentStep = 5;
        stepDescription = codigoRastreio 
            ? `Pedido entregue/concluído! Código de envio: ${codigoRastreio}` 
            : 'Pedido concluído e entregue com sucesso!';
        statusBadgeText = 'Entregue / Concluído';
        statusBadgeColor = '#10b981';
    } else if (statusNorm === 'enviado') {
        currentStep = 5;
        stepDescription = codigoRastreio 
            ? `Seu pedido foi despachado! Código de rastreio: ${codigoRastreio}` 
            : 'Seu pedido foi despachado e está a caminho!';
        statusBadgeText = 'Enviado';
        statusBadgeColor = '#10b981';
    } else if (statusNorm === 'pronto') {
        currentStep = 5;
        stepDescription = 'Seu pedido está pronto para entrega ou retirada na oficina!';
        statusBadgeText = 'Pronto para Retirada';
        statusBadgeColor = '#10b981';
    } else if (statusNorm === 'acabamento' || (filaNorm === 'concluido' && !['pronto', 'enviado', 'concluida', 'entregue', 'orcamento', 'pre_venda'].includes(statusNorm))) {
        currentStep = 4;
        stepDescription = 'A peça foi impressa e está na fase de acabamento, pós-cura e controle de qualidade.';
        statusBadgeText = 'Em Acabamento';
        statusBadgeColor = '#8b5cf6';
    } else if (filaNorm === 'imprimindo' || statusNorm === 'em_producao') {
        currentStep = 3;
        stepDescription = `Impressão 3D em andamento na ${impressoraNome}! ${percentual > 0 ? `Progresso: ${percentual}%` : ''} ${tempoRestante ? `· Tempo restante: ${tempoRestante}` : ''}`;
        statusBadgeText = `Imprimindo (${percentual || 0}%)`;
        statusBadgeColor = '#10b981';
    } else if ((filaNorm === 'pendente' || statusNorm === 'fila') && !['orcamento', 'pre_venda', 'aguardando_aprovacao'].includes(statusNorm)) {
        currentStep = 2;
        stepDescription = `Seu pedido está preparado e aguardando na fila da impressora (${impressoraNome}).`;
        statusBadgeText = 'Na Fila de Produção';
        statusBadgeColor = '#f59e0b';
    } else if (statusNorm === 'aprovado') {
        currentStep = 1;
        stepDescription = 'Pedido aprovado! Fatiamento e alocação na fila de produção em andamento.';
        statusBadgeText = 'Pedido Aprovado';
        statusBadgeColor = '#06b6d4';
    } else {
        // pre_venda, orcamento, aguardando_aprovacao
        currentStep = 0;
        stepDescription = 'Proposta comercial gerada. Aguardando aprovação para início da impressão.';
        statusBadgeText = 'Orçamento / Aguardando Aprovação';
        statusBadgeColor = '#f59e0b';
    }

    const filamentosDesc = Array.isArray(filamentos) && filamentos.length > 0
        ? filamentos.map(f => f.nome || 'Filamento Premium').join(', ')
        : 'PLA / PETG Alta Resolução';

    let cleanWhats = String(whatsappEmpresa || '').replace(/\D/g, '');
    if (cleanWhats.length >= 10 && cleanWhats.length <= 11) {
        cleanWhats = '55' + cleanWhats;
    }
    const whatsLink = cleanWhats
        ? `https://wa.me/${cleanWhats}?text=${encodeURIComponent(`Olá! Gostaria de tirar dúvidas sobre o meu pedido #${pedidoId} (${nomeItem}).`)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(`Olá! Gostaria de informações sobre o pedido #${pedidoId} (${nomeItem}).`)}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rastreio de Pedido #${pedidoId} — ${nomeEmpresa}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #080a10;
            --card-bg: rgba(15, 23, 42, 0.75);
            --border: rgba(255, 255, 255, 0.08);
            --primary: #06b6d4;
            --accent: #7c3aed;
            --success: #10b981;
            --warning: #f59e0b;
            --text: #f8fafc;
            --text-dim: #94a3b8;
            --text-dark: #64748b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        body {
            background-color: var(--bg);
            background-image: 
                radial-gradient(ellipse at top right, rgba(6, 182, 212, 0.15), transparent 50%),
                radial-gradient(ellipse at bottom left, rgba(124, 58, 237, 0.15), transparent 50%);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
        }

        .container {
            width: 100%;
            max-width: 680px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* HEADER */
        .brand-header {
            text-align: center;
            padding: 10px 0 6px;
        }

        .brand-logo {
            font-size: 32px;
            margin-bottom: 6px;
            display: inline-block;
            background: linear-gradient(135deg, #0891b2, #7c3aed);
            width: 60px;
            height: 60px;
            line-height: 60px;
            border-radius: 16px;
            box-shadow: 0 8px 24px rgba(6, 182, 212, 0.25);
        }

        .brand-title {
            font-size: 20px;
            font-weight: 700;
            color: var(--text);
            letter-spacing: -0.5px;
        }

        .brand-subtitle {
            font-size: 12px;
            color: var(--text-dim);
            margin-top: 2px;
        }

        /* MAIN CARD */
        .card {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }

        .order-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 1px solid var(--border);
            padding-bottom: 18px;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 12px;
        }

        .order-id-badge {
            font-size: 11px;
            font-weight: 600;
            color: var(--primary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .order-title {
            font-size: 22px;
            font-weight: 800;
            color: var(--text);
            margin-top: 2px;
        }

        .status-pill {
            padding: 6px 14px;
            border-radius: 30px;
            font-size: 12px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
        }

        /* TIMELINE */
        .timeline {
            display: flex;
            flex-direction: column;
            gap: 0;
            position: relative;
            margin: 24px 0 16px;
            padding-left: 10px;
        }

        .timeline-step {
            display: flex;
            gap: 16px;
            position: relative;
            padding-bottom: 28px;
        }

        .timeline-step:last-child {
            padding-bottom: 4px;
        }

        .step-indicator {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 2;
        }

        .step-circle {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: #1e293b;
            border: 2px solid #334155;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            color: var(--text-dim);
            transition: all 0.3s ease;
        }

        .timeline-step.completed .step-circle {
            background: var(--success);
            border-color: var(--success);
            color: white;
            box-shadow: 0 0 14px rgba(16, 185, 129, 0.4);
        }

        .timeline-step.active .step-circle {
            background: linear-gradient(135deg, #0891b2, #7c3aed);
            border-color: var(--primary);
            color: white;
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.5);
            animation: pulse 2.5s infinite;
        }

        .step-line {
            width: 2px;
            flex-grow: 1;
            background: #1e293b;
            margin-top: 4px;
            margin-bottom: 4px;
        }

        .timeline-step.completed .step-line {
            background: var(--success);
        }

        .step-content {
            padding-top: 6px;
            flex: 1;
        }

        .step-title {
            font-size: 14px;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 2px;
        }

        .timeline-step.pending .step-title {
            color: var(--text-dark);
        }

        .step-desc {
            font-size: 12px;
            color: var(--text-dim);
            line-height: 1.4;
        }

        .timeline-step.active .step-desc {
            color: #38bdf8;
            font-weight: 500;
        }

        /* PROGRESS BAR LIVE */
        .live-progress-box {
            background: rgba(6, 182, 212, 0.1);
            border: 1px solid rgba(6, 182, 212, 0.3);
            border-radius: 12px;
            padding: 14px;
            margin-top: 10px;
        }

        .live-progress-head {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 6px;
        }

        .live-progress-track {
            height: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            overflow: hidden;
        }

        .live-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #06b6d4, #10b981);
            border-radius: 6px;
            transition: width 0.5s ease;
        }

        /* SPECS GRID */
        .specs-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 18px;
            padding-top: 18px;
            border-top: 1px solid var(--border);
        }

        .spec-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 12px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .spec-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-dark);
            margin-bottom: 4px;
            display: block;
        }

        .spec-value {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
        }

        /* ACTIONS */
        .btn-whatsapp {
            background: #10b981;
            color: white;
            text-decoration: none;
            padding: 14px 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
            box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
        }

        .btn-whatsapp:hover {
            transform: translateY(-2px);
            background: #059669;
        }

        .search-box {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }

        .search-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px 14px;
            color: white;
            font-size: 13px;
        }

        .search-btn {
            background: var(--primary);
            border: none;
            color: #080a10;
            font-weight: 700;
            padding: 0 18px;
            border-radius: 10px;
            cursor: pointer;
        }

        .footer-text {
            text-align: center;
            font-size: 11px;
            color: var(--text-dark);
            margin-top: 10px;
        }

        @media (max-width: 480px) {
            .specs-grid {
                grid-template-columns: 1fr;
            }
            .order-title {
                font-size: 18px;
            }
        }
    </style>
</head>
<body>

    <div class="container">
        <header class="brand-header">
            <div class="brand-logo">🧊</div>
            <h1 class="brand-title">${nomeEmpresa}</h1>
            <p class="brand-subtitle">Portal de Rastreio de Impressão 3D</p>
        </header>

        <div class="card">
            <div class="order-head">
                <div>
                    <span class="order-id-badge">Pedido #${pedidoId}</span>
                    <h2 class="order-title">${nomeItem}</h2>
                    <p style="font-size:12px;color:var(--text-dim);margin-top:4px;">Cliente: <b>${nomeCliente}</b> · Quantidade: <b>${quantidade} un.</b></p>
                </div>
                <div class="status-pill" style="background:${statusBadgeColor}22;color:${statusBadgeColor};border-color:${statusBadgeColor}66;">
                    <span class="status-dot"></span>
                    ${statusBadgeText}
                </div>
            </div>

            <!-- TIMELINE VISUAL DE 5 ETAPAS -->
            <div class="timeline">
                <!-- ETAPA 1 -->
                <div class="timeline-step ${currentStep > 1 ? 'completed' : (currentStep >= 0 ? 'active' : 'pending')}">
                    <div class="step-indicator">
                        <div class="step-circle">${currentStep > 1 ? '✓' : (currentStep === 0 ? '📝' : '1')}</div>
                        <div class="step-line"></div>
                    </div>
                    <div class="step-content">
                        <div class="step-title">${currentStep === 0 ? '📝 Proposta / Orçamento Gerado' : '✅ Pedido Aprovado'}</div>
                        <div class="step-desc">${currentStep <= 1 ? stepDescription : `Pedido confirmado em ${dataCriacao}.`}</div>
                    </div>
                </div>

                <!-- ETAPA 2 -->
                <div class="timeline-step ${currentStep > 2 ? 'completed' : (currentStep === 2 ? 'active' : 'pending')}">
                    <div class="step-indicator">
                        <div class="step-circle">${currentStep > 2 ? '✓' : '2'}</div>
                        <div class="step-line"></div>
                    </div>
                    <div class="step-content">
                        <div class="step-title">Na Fila de Produção</div>
                        <div class="step-desc">${currentStep === 2 ? stepDescription : `Fatiamento pronto e alocado na máquina.`}</div>
                    </div>
                </div>

                <!-- ETAPA 3 -->
                <div class="timeline-step ${currentStep > 3 ? 'completed' : (currentStep === 3 ? 'active' : 'pending')}">
                    <div class="step-indicator">
                        <div class="step-circle">${currentStep > 3 ? '✓' : '3'}</div>
                        <div class="step-line"></div>
                    </div>
                    <div class="step-content">
                        <div class="step-title">Imprimindo em 3D</div>
                        <div class="step-desc">${currentStep === 3 ? stepDescription : 'Fabricação aditiva camada por camada.'}</div>
                        ${currentStep === 3 ? `
                            <div class="live-progress-box">
                                <div class="live-progress-head">
                                    <span>Progresso na ${impressoraNome}</span>
                                    <strong>${percentual}%</strong>
                                </div>
                                <div class="live-progress-track">
                                    <div class="live-progress-bar" style="width:${percentual}%;"></div>
                                </div>
                                ${tempoRestante ? `<small style="font-size:11px;color:var(--primary);display:block;margin-top:6px;">⏱️ Tempo restante estimado: <b>${tempoRestante}</b></small>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- ETAPA 4 -->
                <div class="timeline-step ${currentStep > 4 ? 'completed' : (currentStep === 4 ? 'active' : 'pending')}">
                    <div class="step-indicator">
                        <div class="step-circle">${currentStep > 4 ? '✓' : '4'}</div>
                        <div class="step-line"></div>
                    </div>
                    <div class="step-content">
                        <div class="step-title">Acabamento & Qualidade</div>
                        <div class="step-desc">${currentStep === 4 ? stepDescription : 'Remoção de suportes, cura e inspeção dimensional.'}</div>
                    </div>
                </div>

                <!-- ETAPA 5 -->
                <div class="timeline-step ${currentStep === 5 ? 'completed' : 'pending'}">
                    <div class="step-indicator">
                        <div class="step-circle">5</div>
                    </div>
                    <div class="step-content">
                        <div class="step-title">Pronto / Enviado</div>
                        <div class="step-desc">${currentStep === 5 ? stepDescription : 'Embalagem e despacho com código de rastreio.'}</div>
                    </div>
                </div>
            </div>

            <!-- ESPECIFICAÇÕES TÉCNICAS -->
            <div class="specs-grid">
                <div class="spec-item">
                    <span class="spec-label">Material & Cor</span>
                    <span class="spec-value">${filamentosDesc}</span>
                </div>
                <div class="spec-item">
                    <span class="spec-label">Data do Registro</span>
                    <span class="spec-value">${dataCriacao}</span>
                </div>
                ${codigoRastreio ? `
                <div class="spec-item" style="grid-column:span 2;background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.3);">
                    <span class="spec-label" style="color:var(--success);">📦 Código de Rastreio dos Correios/Transportadora</span>
                    <span class="spec-value" style="color:var(--success);font-size:15px;letter-spacing:1px;">${codigoRastreio}</span>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- CONTATO WHATSAPP -->
        <a href="${whatsLink}" target="_blank" class="btn-whatsapp">
            <span>💬 Dúvidas sobre o pedido? Fale conosco no WhatsApp</span>
        </a>

        <!-- BUSCAR OUTRO PEDIDO -->
        <div class="card" style="padding:16px;">
            <p style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">Consultar outro pedido:</p>
            <div class="search-box">
                <input type="text" id="inputOutroPedido" class="search-input" placeholder="Digite o número do pedido (ex: PED-102)">
                <button class="search-btn" onclick="buscarOutroPedido()">Buscar</button>
            </div>
        </div>

        <p class="footer-text">
            Powered by <b>3D Manager Pro</b> — Gestão Inteligente para Print Farms
        </p>
    </div>

    <script>
        function buscarOutroPedido() {
            const val = document.getElementById('inputOutroPedido').value.trim();
            if (val) {
                window.location.href = '/status/' + encodeURIComponent(val);
            }
        }
        document.getElementById('inputOutroPedido').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') buscarOutroPedido();
        });

        // Auto-refresh a cada 15 segundos se estiver imprimindo
        const isImprimindo = ${currentStep === 3 ? 'true' : 'false'};
        if (isImprimindo) {
            setTimeout(() => {
                window.location.reload();
            }, 15000);
        }
    </script>
</body>
</html>`;
}

module.exports = { renderTrackingPage };
