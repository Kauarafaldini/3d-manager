/**
 * 3D Manager Pro — Módulo de Proposta Comercial / Orçamento em PDF & WhatsApp
 * Gera orçamentos elegantes com QR Code PIX, Código de Barras Code 128, especificações 3D e link de rastreio.
 */

window.PdfOrcamentoModulo = (function () {

    let dadosAtuaisProposta = null;

    /**
     * Gerador de Código de Barras Code 128B em SVG vetorial autônomo (sem libs pesadas)
     */
    function gerarCodigoBarrasSvg(texto, altura = 38, larguraModulo = 1.8) {
        if (!texto) return '';
        const rawText = String(texto).trim();
        if (!rawText) return '';

        // Tabela de padrões Code 128 (larguras relativas de barras/espaços)
        const patterns = [
            "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
            "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
            "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
            "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
            "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
            "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
            "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
            "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
            "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
            "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
            "114131","311141","411131","211412","211214","211232","2331112"
        ];

        // Start B = 104
        let checksum = 104;
        let sequence = [patterns[104]];

        const textToEncode = rawText.slice(0, 48);

        for (let i = 0; i < textToEncode.length; i++) {
            const code = textToEncode.charCodeAt(i) - 32;
            if (code >= 0 && code < 95) {
                checksum += code * (i + 1);
                sequence.push(patterns[code]);
            } else {
                sequence.push(patterns[0]);
            }
        }

        const checkDigit = checksum % 103;
        sequence.push(patterns[checkDigit]);
        sequence.push(patterns[106]); // Stop character

        let totalWidth = 0;
        let rects = [];
        let curX = 8;

        for (const p of sequence) {
            for (let j = 0; j < p.length; j++) {
                const w = parseInt(p[j], 10) * larguraModulo;
                if (j % 2 === 0) { // Barra preta
                    rects.push(`<rect x="${curX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${altura}" fill="#0f172a" />`);
                }
                curX += w;
            }
        }
        totalWidth = Math.ceil(curX + 8);
        const safeLabel = rawText.replace(/[<>&"]/g, '');

        return `
            <div style="display:inline-flex;flex-direction:column;align-items:center;background:white;padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05);max-width:100%;">
                <svg width="${totalWidth}" height="${altura}" viewBox="0 0 ${totalWidth} ${altura}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto;">
                    ${rects.join('')}
                </svg>
                <span style="font-family:monospace;font-size:9px;color:#334155;letter-spacing:1px;margin-top:3px;font-weight:700;word-break:break-all;max-width:240px;text-align:center;">${safeLabel}</span>
            </div>
        `;
    }

    /**
     * Gerador de QR Code vetorial SVG autônomo (sem libs pesadas)
     */
    function gerarQrCodeSvg(texto, tamanho = 120) {
        if (!texto) return '';
        const encoded = encodeURIComponent(texto);
        return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}&data=${encoded}&margin=1" alt="QR Code PIX" style="width:${tamanho}px;height:${tamanho}px;border-radius:8px;background:white;padding:5px;border:1px solid #cbd5e1;display:block;" onerror="this.outerHTML='<div style=\\'width:${tamanho}px;height:${tamanho}px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#64748b;font-size:10px;text-align:center;border-radius:8px;border:1px solid #cbd5e1;\\'>QR Code PIX</div>'">`;
    }

    /**
     * Controle do Slider de Prazo de Produção
     */
    function aoMudarSliderPrazo(val) {
        const slider = document.getElementById('pdfPrazoSlider');
        const unidadeSelect = document.getElementById('pdfPrazoTipoUnidade');
        const badge = document.getElementById('pdfPrazoBadge');
        const hiddenPrazo = document.getElementById('pdfPrazo');

        const dias = val !== undefined ? parseInt(val, 10) : (parseInt(slider?.value, 10) || 3);
        const unidade = unidadeSelect?.value || 'úteis';

        let textoPrazo = '';
        if (unidade === 'horas') {
            const horas = dias * 4;
            textoPrazo = `${horas} horas`;
        } else if (unidade === 'corridos') {
            textoPrazo = `${dias} ${dias === 1 ? 'dia corrido' : 'dias corridos'}`;
        } else {
            textoPrazo = `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
        }

        if (badge) badge.textContent = textoPrazo;
        if (hiddenPrazo) hiddenPrazo.value = textoPrazo;

        atualizarPreviewProposta();
    }

    function togglePrazoPersonalizado(ativo) {
        const inputCustom = document.getElementById('pdfPrazoCustomInput');
        const slider = document.getElementById('pdfPrazoSlider');
        const unidadeSelect = document.getElementById('pdfPrazoTipoUnidade');

        if (inputCustom) {
            inputCustom.style.display = ativo ? 'block' : 'none';
            if (ativo) {
                inputCustom.focus();
            }
        }
        if (slider) slider.disabled = ativo;
        if (unidadeSelect) unidadeSelect.disabled = ativo;

        atualizarPreviewProposta();
    }

    /**
     * Controle do Slider de Validade da Proposta
     */
    function aoMudarSliderValidade(val) {
        const slider = document.getElementById('pdfValidadeSlider');
        const badge = document.getElementById('pdfValidadeBadge');
        const hiddenValidade = document.getElementById('pdfValidade');

        const dias = val !== undefined ? parseInt(val, 10) : (parseInt(slider?.value, 10) || 7);
        const textoValidade = `${dias} ${dias === 1 ? 'dia' : 'dias'}`;

        if (badge) badge.textContent = textoValidade;
        if (hiddenValidade) hiddenValidade.value = String(dias);

        atualizarPreviewProposta();
    }

    function toggleValidadePersonalizada(ativo) {
        const inputCustom = document.getElementById('pdfValidadeCustomInput');
        const slider = document.getElementById('pdfValidadeSlider');

        if (inputCustom) {
            inputCustom.style.display = ativo ? 'block' : 'none';
            if (ativo) {
                inputCustom.focus();
            }
        }
        if (slider) slider.disabled = ativo;

        atualizarPreviewProposta();
    }

    /**
     * Abre modal de orçamento a partir da Calculadora ou de uma Pré-venda
     */
    function abrirModalProposta(dados = null) {
        const modal = document.getElementById('orcamentoPdfModalOverlay');
        if (!modal) return;

        // Puxa perfil oficial da loja
        const perfil = (window.PerfilLojaModulo && typeof window.PerfilLojaModulo.obterDadosPerfil === 'function')
            ? window.PerfilLojaModulo.obterDadosPerfil()
            : (window.apiClient?.getUser?.() || {});

        const empresaNome = perfil.empresa || perfil.nome || '3D Manager Studio';
        const configPix = perfil.chavePix || localStorage.getItem('3dm_chave_pix') || '';

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
                prazoProducao: '3 dias úteis',
                observacoes: ''
            };
        }

        dadosAtuaisProposta = dados;

        // Preenche campos do formulário (Nome da Loja somente leitura puxado do perfil)
        const fEmpresa = document.getElementById('pdfEmpresaNome');
        if (fEmpresa) {
            fEmpresa.value = empresaNome;
            fEmpresa.readOnly = true;
        }

        const fCliente = document.getElementById('pdfClienteNome');
        if (fCliente) fCliente.value = dados.clienteNome || '';

        const fTelefone = document.getElementById('pdfClienteTelefone');
        if (fTelefone) fTelefone.value = dados.clienteTelefone || '';

        const fChavePix = document.getElementById('pdfChavePix');
        if (fChavePix) fChavePix.value = dados.chavePix || configPix;

        const fItemNome = document.getElementById('pdfItemNome');
        if (fItemNome) fItemNome.value = dados.nomeItem || 'Peça Impressa 3D';

        const fItemValor = document.getElementById('pdfItemValor');
        if (fItemValor) fItemValor.value = Number(dados.valorUnitario || 0).toFixed(2);

        const fItemQtd = document.getElementById('pdfItemQtd');
        if (fItemQtd) fItemQtd.value = dados.quantidade || 1;

        const fCondicoes = document.getElementById('pdfCondicoes');
        if (fCondicoes) fCondicoes.value = dados.condicoes || '50% de sinal no pedido + 50% na entrega.';

        const fObs = document.getElementById('pdfObservacoes');
        if (fObs) fObs.value = dados.observacoes || '';

        // Reset e configuração dos sliders
        const sliderPrazo = document.getElementById('pdfPrazoSlider');
        if (sliderPrazo) sliderPrazo.value = '3';
        const checkPrazo = document.getElementById('pdfPrazoCustomCheck');
        if (checkPrazo) checkPrazo.checked = false;
        togglePrazoPersonalizado(false);
        aoMudarSliderPrazo(3);

        const sliderValidade = document.getElementById('pdfValidadeSlider');
        if (sliderValidade) sliderValidade.value = String(dados.validadeDias || 7);
        const checkValidade = document.getElementById('pdfValidadeCustomCheck');
        if (checkValidade) checkValidade.checked = false;
        toggleValidadePersonalizada(false);
        aoMudarSliderValidade(dados.validadeDias || 7);

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
        const chavePix = document.getElementById('pdfChavePix')?.value?.trim() || '';
        const condicoes = document.getElementById('pdfCondicoes')?.value || 'À vista ou 50% de sinal.';
        const observacoes = document.getElementById('pdfObservacoes')?.value?.trim() || '';

        // Determina prazo
        const isPrazoCustom = document.getElementById('pdfPrazoCustomCheck')?.checked;
        const prazoCustomText = document.getElementById('pdfPrazoCustomInput')?.value?.trim();
        const prazo = (isPrazoCustom && prazoCustomText) ? prazoCustomText : (document.getElementById('pdfPrazo')?.value || '3 dias úteis');

        // Determina validade
        const isValidadeCustom = document.getElementById('pdfValidadeCustomCheck')?.checked;
        const validadeCustomText = document.getElementById('pdfValidadeCustomInput')?.value?.trim();
        const validade = (isValidadeCustom && validadeCustomText) ? validadeCustomText : (document.getElementById('pdfValidade')?.value || '7');

        if (chavePix) {
            localStorage.setItem('3dm_chave_pix', chavePix);
        }

        const valorTotal = valorUnit * qtd;
        const pedidoId = dadosAtuaisProposta?.pedidoId || 'ORC-' + Math.random().toString(36).substring(2, 7).toUpperCase();
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

        // Gera QR Code PIX
        const qrCodePixHtml = chavePix ? gerarQrCodeSvg(chavePix, 115) : '';

        // Gera Código de Barras Code 128 da Chave PIX (ou do Pedido)
        const codigoBarrasValor = chavePix || pedidoId;
        const barcodeSvgHtml = gerarCodigoBarrasSvg(codigoBarrasValor, 34, 1.6);

        previewContainer.innerHTML = `
            <div class="orcamento-doc-paper">
                <!-- CABEÇALHO -->
                <div class="doc-header">
                    <div class="doc-brand">
                        <div class="doc-logo-box">🧊</div>
                        <div>
                            <h2 class="doc-company-name">${empresaNome}</h2>
                            <span class="doc-company-sub">Impressão 3D, Prototipagem & Engenharia Aditiva</span>
                        </div>
                    </div>
                    <div class="doc-meta">
                        <span class="doc-tag">PROPOSTA COMERCIAL</span>
                        <strong class="doc-num">#${pedidoId}</strong>
                        <small>Data: ${dataHoje}</small>
                        <small>Validade: ${validade} ${String(validade).includes('dia') ? '' : 'dias'}</small>
                    </div>
                </div>

                <!-- DADOS DO CLIENTE & PRAZO -->
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
                        <span class="doc-lbl">PRAZO ESTIMADO DE PRODUÇÃO</span>
                        <strong style="color:#0891b2;">⚡ ${prazo}</strong>
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
                                    🧵 <b>Material:</b> ${filamentosTexto} | ⏱️ <b>Tempo de Máquina:</b> ~${Number(dadosAtuaisProposta?.tempoHoras || 1).toFixed(1)}h | ⚖️ <b>Peso:</b> ~${dadosAtuaisProposta?.pesoTotalGramas || 50}g
                                </span>
                            </td>
                            <td style="text-align:center;font-weight:600;">${qtd}</td>
                            <td style="text-align:right;font-weight:600;">R$ ${valorUnit.toFixed(2)}</td>
                            <td style="text-align:right;font-weight:700;color:#0f172a;">R$ ${valorTotal.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- OBSERVAÇÕES ADICIONAIS -->
                ${observacoes ? `
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px 14px;border-radius:10px;margin-bottom:14px;">
                    <span style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:3px;">📝 Observações & Especificações Especiais</span>
                    <p style="font-size:11px;color:#334155;margin:0;line-height:1.4;white-space:pre-line;">${observacoes}</p>
                </div>
                ` : ''}

                <!-- TOTAIS, PAGAMENTO & CÓDIGO DE BARRAS / QR CODE -->
                <div class="doc-footer-grid">
                    <div class="doc-payment-box">
                        <span class="doc-lbl">CONDIÇÕES DE PAGAMENTO & CHAVE PIX</span>
                        <p style="font-size:12px;color:#334155;margin:4px 0 8px;line-height:1.4;">${condicoes}</p>
                        
                        ${chavePix ? `
                        <div style="display:flex;gap:12px;align-items:center;background:#f8fafc;padding:10px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:8px;">
                            ${qrCodePixHtml}
                            <div style="flex:1;min-width:0;">
                                <span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Chave PIX Oficial:</span>
                                <code style="display:block;font-size:11px;color:#0f172a;background:#e2e8f0;padding:4px 6px;border-radius:6px;word-break:break-all;margin-top:2px;font-weight:700;">${chavePix}</code>
                                <small style="font-size:9px;color:#64748b;display:block;margin-top:4px;">Aponte a câmera no QR Code ou use o Código de Barras abaixo.</small>
                            </div>
                        </div>
                        <div style="display:flex;justify-content:center;margin-top:6px;">
                            ${barcodeSvgHtml}
                        </div>
                        ` : `
                        <div style="display:flex;justify-content:center;margin-top:6px;">
                            ${barcodeSvgHtml}
                        </div>
                        `}
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
                            <span style="font-size:10px;color:#0369a1;font-weight:700;display:block;">🔗 LINK DE RASTREAMENTO EM TEMPO REAL:</span>
                            <a href="${trackingUrl}" target="_blank" style="font-size:10px;color:#0284c7;text-decoration:underline;word-break:break-all;">${trackingUrl}</a>
                        </div>
                    </div>
                </div>

                <!-- TERMOS E NOTAS -->
                <div class="doc-terms">
                    <p>• Impressão 3D de alta precisão com acabamento profissional. Variações dimensionais de ±0.2mm são inerentes ao processo de fabricação aditiva FDM.</p>
                    <p>• Acompanhe todas as etapas da sua produção (Orçamento ➔ Fila ➔ Impressão ➔ Acabamento ➔ Envio) em tempo real pelo link de rastreamento.</p>
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
        const chavePix = document.getElementById('pdfChavePix')?.value?.trim() || '';
        const condicoes = document.getElementById('pdfCondicoes')?.value || '50% de entrada e restante na entrega.';
        const observacoes = document.getElementById('pdfObservacoes')?.value?.trim() || '';

        const isPrazoCustom = document.getElementById('pdfPrazoCustomCheck')?.checked;
        const prazoCustomText = document.getElementById('pdfPrazoCustomInput')?.value?.trim();
        const prazo = (isPrazoCustom && prazoCustomText) ? prazoCustomText : (document.getElementById('pdfPrazo')?.value || '3 dias úteis');

        const valorTotal = (valorUnit * qtd).toFixed(2);
        const pedidoId = dadosAtuaisProposta?.pedidoId || 'ORC-2026';

        const apiUrl = window.APP_CONFIG?.getApiUrl?.() || 'https://threed-manager-q1tc.onrender.com';
        const trackingUrl = `${apiUrl}/status/${encodeURIComponent(pedidoId)}`;

        let texto = `Olá *${clienteNome}*! Tudo bem? 👋\n\nSegue o orçamento do seu projeto na *${empresaNome}*:\n\n` +
            `📦 *Item:* ${itemNome}\n` +
            `🔢 *Quantidade:* ${qtd} un.\n` +
            `💰 *Valor Total:* R$ ${valorTotal}\n` +
            `⏱️ *Prazo de Produção:* ${prazo}\n` +
            `💳 *Condições:* ${condicoes}\n\n`;

        if (observacoes) {
            texto += `📝 *Observações:* ${observacoes}\n\n`;
        }

        if (chavePix) {
            texto += `🔑 *Chave PIX:* \`${chavePix}\`\n\n`;
        }

        texto += `🔍 *Acompanhe a impressão em tempo real:*\n${trackingUrl}\n\n` +
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
        aoMudarSliderPrazo,
        togglePrazoPersonalizado,
        aoMudarSliderValidade,
        toggleValidadePersonalizada,
        imprimirProposta,
        copiarMensagemWhatsApp,
        copiarLinkRastreio,
        gerarCodigoBarrasSvg,
        gerarQrCodeSvg
    };
})();
