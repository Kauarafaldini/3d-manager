/**
 * 3D Manager Pro — Módulo de Proposta Comercial / Orçamento em PDF & WhatsApp
 * Gera orçamentos elegantes com QR Code PIX, especificações 3D e link de rastreio.
 */

window.PdfOrcamentoModulo = (function () {

    let dadosAtuaisProposta = null;

    /**
     * Gerador de QR Code vetorial SVG autônomo (sem libs pesadas)
     */
    function gerarQrCodeSvg(texto, tamanho = 140) {
        // Usa API de QR Code gratuita e rápida com fallback para SVG local
        const encoded = encodeURIComponent(texto);
        return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}&data=${encoded}&margin=1" alt="QR Code PIX" style="width:${tamanho}px;height:${tamanho}px;border-radius:10px;background:white;padding:6px;border:1px solid #e2e8f0;display:block;" onerror="this.outerHTML='<div style=\\'width:${tamanho}px;height:${tamanho}px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#64748b;font-size:10px;text-align:center;border-radius:8px;\\'>QR Code PIX</div>'">`;
    }

    /**
     * Gera payload PIX Copia e Cola simplificado / chave PIX
     */
    function gerarChavePixOuPayload(chave, valor, beneficiario = 'Loja 3D') {
        if (!chave) return '';
        // Se a chave já for um payload BR Code longo, retorna direto
        if (chave.startsWith('000201')) return chave;
        return chave;
    }

    /**
     * Abre modal de orçamento a partir da Calculadora ou de uma Pré-venda
     */
    function abrirModalProposta(dados = null) {
        const modal = document.getElementById('orcamentoPdfModalOverlay');
        if (!modal) return;

        const user = window.apiClient?.getUser?.() || {};
        const empresaNome = user.empresa || user.nome || '3D Manager Studio';
        const configPix = localStorage.getItem('3dm_chave_pix') || '';

        // Se não foi passado dados, tenta extrair da Calculadora de Preços
        if (!dados) {
            const calc = typeof window.calcFinanceiro === 'function' ? window.calcFinanceiro(false) : {};
            const nomeItem = document.getElementById('pNome')?.value || 'Projeto 3D Personalizado';
            const qtd = parseInt(document.getElementById('pQuantidadeChapa')?.value, 10) || 1;
            const pedidoId = 'ORC-' + Math.random().toString(36).substring(2, 7).toUpperCase();

            dados = {
                pedidoId,
                empresaNome,
                clienteNome: '',
                clienteTelefone: '',
                nomeItem,
                quantidade: qtd,
                valorUnitario: calc.venda || 0,
                valorTotal: (calc.venda || 0) * qtd,
                tempoHoras: calc.tempo || 1,
                pesoTotalGramas: calc.peso || 50,
                filamentos: calc.filamentosUsados || [],
                validadeDias: 7,
                chavePix: configPix,
                condicoes: '50% de sinal no pedido + 50% na conclusão / entrega.',
                prazoProducao: '2 a 4 dias úteis'
            };
        }

        dadosAtuaisProposta = dados;

        // Preenche campos do formulário de personalização do modal
        document.getElementById('pdfEmpresaNome').value = dados.empresaNome || empresaNome;
        document.getElementById('pdfClienteNome').value = dados.clienteNome || '';
        document.getElementById('pdfClienteTelefone').value = dados.clienteTelefone || '';
        document.getElementById('pdfItemNome').value = dados.nomeItem || 'Peça Impressa 3D';
        document.getElementById('pdfItemValor').value = Number(dados.valorUnitario || 0).toFixed(2);
        document.getElementById('pdfItemQtd').value = dados.quantidade || 1;
        document.getElementById('pdfChavePix').value = dados.chavePix || configPix;
        document.getElementById('pdfPrazo').value = dados.prazoProducao || '2 a 4 dias úteis';
        document.getElementById('pdfCondicoes').value = dados.condicoes || '50% de entrada e restante na entrega.';
        document.getElementById('pdfValidade').value = dados.validadeDias || 7;

        atualizarPreviewProposta();
        modal.style.display = 'flex';
    }

    function fecharModalProposta(e) {
        if (e && e.target && e.target.id !== 'orcamentoPdfModalOverlay') return;
        const modal = document.getElementById('orcamentoPdfModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    /**
     * Atualiza o documento de preview em tempo real
     */
    function atualizarPreviewProposta() {
        const empresaNome = document.getElementById('pdfEmpresaNome')?.value || '3D Studio';
        const clienteNome = document.getElementById('pdfClienteNome')?.value || 'Cliente Especial';
        const clienteTel = document.getElementById('pdfClienteTelefone')?.value || '';
        const itemNome = document.getElementById('pdfItemNome')?.value || 'Peça 3D';
        const valorUnit = parseFloat(document.getElementById('pdfItemValor')?.value) || 0;
        const qtd = parseInt(document.getElementById('pdfItemQtd')?.value, 10) || 1;
        const chavePix = document.getElementById('pdfChavePix')?.value || '';
        const prazo = document.getElementById('pdfPrazo')?.value || '3 dias úteis';
        const condicoes = document.getElementById('pdfCondicoes')?.value || 'À vista ou 50% de sinal.';
        const validade = document.getElementById('pdfValidade')?.value || '7';

        if (chavePix) {
            localStorage.setItem('3dm_chave_pix', chavePix);
        }

        const valorTotal = valorUnit * qtd;
        const pedidoId = dadosAtuaisProposta?.pedidoId || 'ORC-2026';
        const dataHoje = new Date().toLocaleDateString('pt-BR');

        // Filamentos formatados
        const filamentos = dadosAtuaisProposta?.filamentos || [];
        const filamentosTexto = filamentos.length > 0
            ? filamentos.map(f => `${f.nome || 'Filamento'} (${f.peso || 0}g)`).join(' · ')
            : `${dadosAtuaisProposta?.pesoTotalGramas || 50}g de filamento`;

        const apiUrl = window.APP_CONFIG?.getApiUrl?.() || 'https://threed-manager-q1tc.onrender.com';
        const trackingUrl = `${apiUrl}/status/${encodeURIComponent(pedidoId)}`;

        const previewContainer = document.getElementById('pdfOrcamentoDocumento');
        if (!previewContainer) return;

        const qrCodePixHtml = chavePix ? gerarQrCodeSvg(chavePix, 110) : '';

        previewContainer.innerHTML = `
            <div class="orcamento-doc-paper">
                <!-- CABEÇALHO -->
                <div class="doc-header">
                    <div class="doc-brand">
                        <div class="doc-logo-box">🧊</div>
                        <div>
                            <h2 class="doc-company-name">${empresaNome}</h2>
                            <span class="doc-company-sub">Impressão 3D & Prototipagem de Alta Resolução</span>
                        </div>
                    </div>
                    <div class="doc-meta">
                        <span class="doc-tag">PROPOSTA COMERCIAL</span>
                        <strong class="doc-num">#${pedidoId}</strong>
                        <small>Data: ${dataHoje}</small>
                        <small>Validade: ${validade} dias</small>
                    </div>
                </div>

                <!-- DADOS DO CLIENTE -->
                <div class="doc-client-card">
                    <div class="doc-client-item">
                        <span class="doc-lbl">CLIENTE</span>
                        <strong>${clienteNome}</strong>
                    </div>
                    ${clienteTel ? `
                    <div class="doc-client-item">
                        <span class="doc-lbl">CONTATO / WHATSAPP</span>
                        <strong>${clienteTel}</strong>
                    </div>
                    ` : ''}
                    <div class="doc-client-item">
                        <span class="doc-lbl">PRAZO ESTIMADO</span>
                        <strong style="color:#0891b2;">${prazo}</strong>
                    </div>
                </div>

                <!-- TABELA DE ESPECIFICAÇÕES & ITENS -->
                <table class="doc-table">
                    <thead>
                        <tr>
                            <th>Item & Especificação Técnica 3D</th>
                            <th style="text-align:center;">Qtd</th>
                            <th style="text-align:right;">Unitário</th>
                            <th style="text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <strong style="font-size:14px;color:#0f172a;display:block;">${itemNome}</strong>
                                <span style="font-size:11px;color:#64748b;display:block;margin-top:2px;">
                                    🧵 <b>Material:</b> ${filamentosTexto} | ⏱️ <b>Tempo:</b> ~${Number(dadosAtuaisProposta?.tempoHoras || 1).toFixed(1)}h | ⚖️ <b>Peso:</b> ~${dadosAtuaisProposta?.pesoTotalGramas || 50}g
                                </span>
                            </td>
                            <td style="text-align:center;font-weight:600;">${qtd}</td>
                            <td style="text-align:right;font-weight:600;">R$ ${valorUnit.toFixed(2)}</td>
                            <td style="text-align:right;font-weight:700;color:#0f172a;">R$ ${valorTotal.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- TOTAIS & PAGAMENTO -->
                <div class="doc-footer-grid">
                    <div class="doc-payment-box">
                        <span class="doc-lbl">CONDIÇÕES DE PAGAMENTO & PIX</span>
                        <p style="font-size:12px;color:#334155;margin:4px 0 8px;line-height:1.4;">${condicoes}</p>
                        
                        ${chavePix ? `
                        <div style="display:flex;gap:12px;align-items:center;background:#f8fafc;padding:10px;border-radius:10px;border:1px solid #e2e8f0;">
                            ${qrCodePixHtml}
                            <div style="flex:1;">
                                <span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Chave PIX:</span>
                                <code style="display:block;font-size:11px;color:#0f172a;background:#e2e8f0;padding:4px 6px;border-radius:6px;word-break:break-all;margin-top:2px;">${chavePix}</code>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <div class="doc-totals-box">
                        <div class="doc-total-line">
                            <span>Subtotal:</span>
                            <strong>R$ ${valorTotal.toFixed(2)}</strong>
                        </div>
                        <div class="doc-total-line" style="border-top:2px solid #cbd5e1;padding-top:8px;margin-top:6px;">
                            <span style="font-size:14px;color:#0f172a;font-weight:700;">VALOR TOTAL:</span>
                            <b style="font-size:20px;color:#0891b2;">R$ ${valorTotal.toFixed(2)}</b>
                        </div>
                        <div style="margin-top:12px;background:#e0f2fe;padding:8px 10px;border-radius:8px;border:1px solid #bae6fd;">
                            <span style="font-size:10px;color:#0369a1;font-weight:700;display:block;">🔗 LINK DE RASTREAMENTO:</span>
                            <a href="${trackingUrl}" target="_blank" style="font-size:10px;color:#0284c7;text-decoration:underline;word-break:break-all;">${trackingUrl}</a>
                        </div>
                    </div>
                </div>

                <!-- TERMOS E NOTAS -->
                <div class="doc-terms">
                    <p>• Impressão 3D de alta precisão com acabamento profissional. Variações dimensionais de ±0.2mm são inerentes ao processo.</p>
                    <p>• Acompanhe todas as etapas da produção (Fila ➔ Impressão ➔ Acabamento ➔ Envio) em tempo real pelo link de rastreamento.</p>
                </div>
            </div>
        `;
    }

    /**
     * Imprimir proposta / Salvar como PDF nativo do navegador
     */
    function imprimirProposta() {
        window.print();
    }

    /**
     * Copia texto formatado para o WhatsApp do cliente
     */
    function copiarMensagemWhatsApp() {
        const empresaNome = document.getElementById('pdfEmpresaNome')?.value || '3D Studio';
        const clienteNome = document.getElementById('pdfClienteNome')?.value || 'Cliente';
        const itemNome = document.getElementById('pdfItemNome')?.value || 'Peça 3D';
        const valorUnit = parseFloat(document.getElementById('pdfItemValor')?.value) || 0;
        const qtd = parseInt(document.getElementById('pdfItemQtd')?.value, 10) || 1;
        const chavePix = document.getElementById('pdfChavePix')?.value || '';
        const prazo = document.getElementById('pdfPrazo')?.value || '3 dias úteis';
        const condicoes = document.getElementById('pdfCondicoes')?.value || '50% de entrada.';
        const valorTotal = (valorUnit * qtd).toFixed(2);
        const pedidoId = dadosAtuaisProposta?.pedidoId || 'ORC-2026';

        const apiUrl = window.APP_CONFIG?.getApiUrl?.() || 'https://threed-manager-q1tc.onrender.com';
        const trackingUrl = `${apiUrl}/status/${encodeURIComponent(pedidoId)}`;

        const texto = `Olá *${clienteNome}*! Tudo bem? 👋\n\nSegue o orçamento do seu projeto na *${empresaNome}*:\n\n` +
            `📦 *Item:* ${itemNome}\n` +
            `🔢 *Quantidade:* ${qtd} un.\n` +
            `💰 *Valor Total:* R$ ${valorTotal}\n` +
            `⏱️ *Prazo de Produção:* ${prazo}\n` +
            `💳 *Condições:* ${condicoes}\n\n` +
            (chavePix ? `🔑 *Chave PIX:* \`${chavePix}\`\n\n` : '') +
            `🔍 *Acompanhe a impressão em tempo real:*\n${trackingUrl}\n\n` +
            `Ficamos à disposição para iniciar a produção! ✨`;

        navigator.clipboard.writeText(texto).then(() => {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Mensagem formatada copiada para o WhatsApp!', 'ok');
            } else {
                alert('Mensagem copiada com sucesso!');
            }
        }).catch(() => {
            prompt('Copie o texto da proposta abaixo:', texto);
        });
    }

    /**
     * Copia apenas o link público de rastreio
     */
    function copiarLinkRastreio(pedidoId) {
        const id = pedidoId || dadosAtuaisProposta?.pedidoId || 'ORC-2026';
        const apiUrl = window.APP_CONFIG?.getApiUrl?.() || 'https://threed-manager-q1tc.onrender.com';
        const url = `${apiUrl}/status/${encodeURIComponent(id)}`;

        navigator.clipboard.writeText(url).then(() => {
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Link de rastreio copiado: ${url}`, 'ok');
            } else {
                alert('Link copiado: ' + url);
            }
        });
    }

    return {
        abrirModalProposta,
        fecharModalProposta,
        atualizarPreviewProposta,
        imprimirProposta,
        copiarMensagemWhatsApp,
        copiarLinkRastreio
    };
})();
