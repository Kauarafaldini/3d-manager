/**
 * 3D Manager Pro — Leitor de QR Code por Câmera (Mobile / Desktop)
 * Permite escanear carretéis de filamento e ordens de serviço instantaneamente.
 */

window.QrScannerModulo = (function () {

    let streamAtivo = null;
    let animFrameId = null;
    let videoEl = null;
    let canvasEl = null;
    let context = null;
    let scannerDestino = 'geral'; // 'geral', 'calculadora', 'pesar'
    let barcodeDetector = null;

    // Inicializa detector nativo se disponível (Chrome, Edge, Android WebView)
    if ('BarcodeDetector' in window) {
        try {
            barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        } catch (_) {}
    }

    /**
     * Abre o modal do scanner de câmera
     * @param {string} destino - 'geral', 'calculadora', 'pesar'
     */
    async function abrirScanner(destino = 'geral') {
        scannerDestino = destino;
        const modal = document.getElementById('qrScannerModalOverlay');
        if (!modal) return;

        modal.style.display = 'flex';
        videoEl = document.getElementById('qrScannerVideo');
        canvasEl = document.getElementById('qrScannerCanvas');
        if (canvasEl) context = canvasEl.getContext('2d', { willReadFrequently: true });

        document.getElementById('qrScannerStatus').textContent = 'Iniciando câmera...';
        document.getElementById('qrScannerStatus').style.color = 'var(--text-dim)';

        try {
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            streamAtivo = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoEl) {
                videoEl.srcObject = streamAtivo;
                videoEl.setAttribute('playsinline', true); // Essencial para iOS Safari
                await videoEl.play();
                document.getElementById('qrScannerStatus').textContent = 'Aponte a câmera para o QR Code da etiqueta';
                document.getElementById('qrScannerStatus').style.color = 'var(--primary)';
                iniciarLoopEscaneamento();
            }
        } catch (err) {
            console.warn('[qr-scanner] Câmera não acessível:', err);
            document.getElementById('qrScannerStatus').innerHTML = '⚠️ Não foi possível abrir a câmera diretamente. Use o botão abaixo para enviar uma foto:';
            document.getElementById('qrScannerStatus').style.color = 'var(--warning)';
        }
    }

    function fecharScanner() {
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
        if (streamAtivo) {
            streamAtivo.getTracks().forEach(track => track.stop());
            streamAtivo = null;
        }
        if (videoEl) videoEl.srcObject = null;

        const modal = document.getElementById('qrScannerModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    /**
     * Loop de análise de quadros de vídeo
     */
    async function iniciarLoopEscaneamento() {
        if (!videoEl || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) {
            animFrameId = requestAnimationFrame(iniciarLoopEscaneamento);
            return;
        }

        if (canvasEl && context) {
            canvasEl.width = videoEl.videoWidth;
            canvasEl.height = videoEl.videoHeight;
            context.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

            // 1. Tenta decodificar com BarcodeDetector nativo
            if (barcodeDetector) {
                try {
                    const barcodes = await barcodeDetector.detect(canvasEl);
                    if (barcodes.length > 0) {
                        const code = barcodes[0].rawValue;
                        if (code) {
                            processarResultadoQr(code);
                            return;
                        }
                    }
                } catch (_) {}
            }

            // 2. Se houver jsQR carregado globalmente
            if (window.jsQR) {
                const imageData = context.getImageData(0, 0, canvasEl.width, canvasEl.height);
                const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                if (code && code.data) {
                    processarResultadoQr(code.data);
                    return;
                }
            }
        }

        animFrameId = requestAnimationFrame(iniciarLoopEscaneamento);
    }

    /**
     * Processa o código decodificado
     */
    async function processarResultadoQr(codigo) {
        console.log('[qr-scanner] QR Code detectado:', codigo);
        tocarBeep();

        document.getElementById('qrScannerStatus').textContent = `✅ QR Code identificado!`;
        document.getElementById('qrScannerStatus').style.color = 'var(--success)';

        fecharScanner();

        // 1. Formato: 3dm:spool:<estoqueId>
        if (codigo.startsWith('3dm:spool:')) {
            const spoolId = codigo.replace('3dm:spool:', '').trim();
            await tratarCarretelEscaneado(spoolId);
            return;
        }

        // 2. Formato: 3dm:order:<pedidoId> ou /status/:pedidoId
        if (codigo.startsWith('3dm:order:') || codigo.includes('/status/')) {
            const pedidoId = codigo.replace('3dm:order:', '').split('/status/').pop().trim();
            window.open(`/status/${encodeURIComponent(pedidoId)}`, '_blank');
            return;
        }

        // 3. Fallback genérico: busca carretel ou produto com o texto
        const EstoqueModel = window.getEstoqueModel ? window.getEstoqueModel() : null;
        if (EstoqueModel) {
            try {
                const carretel = await EstoqueModel.findById(codigo);
                if (carretel) {
                    await tratarCarretelEscaneado(codigo);
                    return;
                }
            } catch (_) {}
        }

        if (typeof mostrarToast === 'function') {
            mostrarToast(`Código escaneado: ${codigo}`, 'ok');
        } else {
            alert('Código lido: ' + codigo);
        }
    }

    /**
     * Ação disparada ao escanear um carretel
     */
    async function tratarCarretelEscaneado(spoolId) {
        try {
            const EstoqueModel = window.getEstoqueModel ? window.getEstoqueModel() : null;
            let carretel = null;
            if (EstoqueModel) {
                carretel = await EstoqueModel.findById(spoolId);
            }

            if (!carretel && Array.isArray(window.estoqueCache)) {
                carretel = window.estoqueCache.find(e => String(e._id) === spoolId);
            }

            const nome = carretel ? carretel.nome : 'Carretel';
            const peso = carretel ? `${Number(carretel.gramas || 0).toFixed(0)}g` : '';

            // Se o scanner foi aberto pela Calculadora
            if (scannerDestino === 'calculadora') {
                if (typeof window.adicionarLinhaFilamento === 'function') {
                    window.adicionarLinhaFilamento({
                        estoqueId: spoolId,
                        precoKg: carretel?.precoKg || 120,
                        peso: 50
                    });
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`🧵 "${nome}" adicionado à Calculadora!`, 'ok');
                    }
                }
                return;
            }

            // Destino padrão: Abre modal para pesar e ajustar o carretel
            if (typeof window.abrirModalCarretel === 'function') {
                window.abrirModalCarretel(spoolId, 'ajuste');
                if (typeof mostrarToast === 'function') {
                    mostrarToast(`⚖️ Carretel "${nome}" (${peso}) pronto para pesagem!`, 'ok');
                }
            } else if (typeof mostrarToast === 'function') {
                mostrarToast(`Carretel escaneado: ${nome} (${peso})`, 'ok');
            }
        } catch (err) {
            console.error('Erro ao processar carretel escaneado:', err);
        }
    }

    /**
     * Permite carregar uma foto da galeria para escanear
     */
    async function escanearArquivoImagem(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;

        const img = new Image();
        img.onload = async () => {
            if (!canvasEl) canvasEl = document.createElement('canvas');
            const ctx = canvasEl.getContext('2d');
            canvasEl.width = img.width;
            canvasEl.height = img.height;
            ctx.drawImage(img, 0, 0);

            if (barcodeDetector) {
                try {
                    const barcodes = await barcodeDetector.detect(canvasEl);
                    if (barcodes.length > 0 && barcodes[0].rawValue) {
                        processarResultadoQr(barcodes[0].rawValue);
                        return;
                    }
                } catch (_) {}
            }

            if (window.jsQR) {
                const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
                const code = window.jsQR(imageData.data, imageData.width, imageData.height);
                if (code && code.data) {
                    processarResultadoQr(code.data);
                    return;
                }
            }

            alert('Não foi possível detectar um QR Code legível nesta imagem. Tente aproximar mais a câmera da etiqueta.');
        };
        img.src = URL.createObjectURL(file);
    }

    function tocarBeep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Nota Lá (A5)
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.12);
        } catch (_) {}
    }

    return {
        abrirScanner,
        fecharScanner,
        escanearArquivoImagem
    };
})();
