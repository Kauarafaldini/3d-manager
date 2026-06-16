const { app, BrowserWindow } = require('electron');
const path = require('path');

let apiProcess = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 850,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.setMenuBarVisibility(false);
    win.loadFile('www/index.html');
}

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
