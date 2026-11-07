const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
    isElectron: true,
    gerarPdf: (payload) => {
        const safePayload = {
            html: typeof payload?.html === 'string' ? payload.html : '',
            nomeArquivo: typeof payload?.nomeArquivo === 'string' ? payload.nomeArquivo : 'Orcamento.pdf'
        };
        return ipcRenderer.invoke('gerar-pdf', safePayload);
    }
}));

