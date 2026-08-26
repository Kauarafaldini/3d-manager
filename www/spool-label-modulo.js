/**
 * 3D Manager Pro — Módulo de Etiquetas QR para Carretéis e Prateleiras
 * Gera etiquetas térmicas e visuais com QR Code para identificação rápida por câmera.
 */

window.SpoolLabelModulo = (function () {

    let carretelAtual = null;

    function gerarQrCodeImg(texto, tamanho = 120) {
        const encoded = encodeURIComponent(texto);
        return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}&data=${encoded}&margin=0" alt="QR Code" style="width:${tamanho}px;height:${tamanho}px;display:block;border-radius:4px;">`;
    }

    /**
     * Abre o modal de etiqueta para um carretel do estoque
     */
    function abrirModalEtiqueta(carretel) {
        if (!carretel) return;
        carretelAtual = carretel;

        const modal = document.getElementById('spoolLabelModalOverlay');
        if (!modal) return;

        const id = carretel._id ? String(carretel._id) : 'SPOOL-001';
        const nome = carretel.nome || 'Filamento';
        const gramas = Number(carretel.gramas || 0).toFixed(0);
        const precoKg = Number(carretel.precoKg || 0).toFixed(2);
        const dataCadastro = carretel.criadoEm ? new Date(carretel.criadoEm).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

        // Payload do QR Code: protocolo interno 3dm:spool:<id>
        const qrPayload = `3dm:spool:${id}`;
        const qrImg = gerarQrCodeImg(qrPayload, 110);

        const labelPreview = document.getElementById('spoolLabelPreviewContainer');
        if (labelPreview) {
            labelPreview.innerHTML = `
                <div class="spool-thermal-label" id="spoolThermalLabelPrint">
                    <div class="label-qr-col">
                        ${qrImg}
                        <span class="label-code-id">${id.substring(0, 8).toUpperCase()}</span>
                    </div>
                    <div class="label-info-col">
                        <div class="label-brand-head">
                            <span class="label-logo">🧊 3D MANAGER</span>
                            <span class="label-badge">FILAMENTO</span>
                        </div>
                        <h4 class="label-material-name">${nome}</h4>
                        <div class="label-specs-grid">
                            <div>
                                <span class="lbl-dim">PESO ATUAL</span>
                                <strong class="lbl-val" style="color:#0891b2;font-size:14px;">${gramas}g</strong>
                            </div>
                            <div>
                                <span class="lbl-dim">PREÇO/KG</span>
                                <strong class="lbl-val">R$ ${precoKg}</strong>
                            </div>
                        </div>
                        <div class="label-footer-info">
                            <span>Entrada: ${dataCadastro}</span>
                            <span style="float:right;">Aponte a câmera para pesar ⚖️</span>
                        </div>
                    </div>
                </div>
            `;
        }

        modal.style.display = 'flex';
    }

    function fecharModalEtiqueta(e) {
        if (e && e.target && e.target.id !== 'spoolLabelModalOverlay') return;
        const modal = document.getElementById('spoolLabelModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    function imprimirEtiqueta() {
        window.print();
    }

    return {
        abrirModalEtiqueta,
        fecharModalEtiqueta,
        imprimirEtiqueta
    };
})();
