const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

try {
    require('electron-reload')(path.join(__dirname, 'www'));
} catch (_) {}

let apiProcess = null;
let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 850,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('www/index.html');
}

// IPC: Gerar PDF a partir do HTML do orçamento
ipcMain.handle('gerar-pdf', async (event, { html, nomeArquivo }) => {
    try {
        // Cria janela oculta para renderizar o HTML
        const pdfWin = new BrowserWindow({
            show: false,
            width: 800,
            height: 1200,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        // Espera o conteúdo carregar (incluindo imagens externas como QR Code)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const pdfBuffer = await pdfWin.webContents.printToPDF({
            printBackground: true,
            marginsType: 0,
            pageSize: 'A4',
            landscape: false
        });

        pdfWin.close();

        // Diálogo de salvar
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Salvar Orçamento em PDF',
            defaultPath: path.join(require('os').homedir(), 'Desktop', nomeArquivo || 'Orcamento.pdf'),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });

        if (filePath) {
            fs.writeFileSync(filePath, pdfBuffer);

            // Tenta abrir o PDF gerado
            try {
                const { shell } = require('electron');
                shell.openPath(filePath);
            } catch (_) {}

            return { success: true, filePath: path.basename(filePath) };
        }

        return { success: false, cancelled: true };
    } catch (err) {
        console.error('Erro ao gerar PDF:', err);
        return { success: false, error: err.message };
    }
});

app.whenReady().then(() => {
    console.log('Iniciando o aplicativo...');
    setTimeout(createWindow, 1000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (apiProcess) apiProcess.kill();
});
