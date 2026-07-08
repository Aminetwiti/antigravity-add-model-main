"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Electron main process.
 * Creates the BrowserWindow, registers IPC handlers, and spawns the ag-doctor CLI.
 */
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const isDev = !electron_1.app.isPackaged;
let mainWindow = null;
const activeStreams = new Map();
/**
 * Locate the ag-doctor CLI.
 * In dev: ../ag-doctor/bin/ag-doctor.js
 * In prod: bundled in resources/
 */
function getCliPath() {
    if (electron_1.app.isPackaged) {
        // Bundled next to the app
        return path_1.default.join(process.resourcesPath, 'ag-doctor', 'bin', 'ag-doctor.js');
    }
    // Dev: sibling directory
    return path_1.default.join(__dirname, '..', '..', 'ag-doctor', 'bin', 'ag-doctor.js');
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#0a0e1a',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0a0e1a',
            symbolColor: '#e8eef9',
            height: 36,
        },
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });
    mainWindow.loadFile(path_1.default.join(__dirname, 'renderer', 'index.html'));
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    if (isDev && process.env.OPEN_DEVTOOLS === '1') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}
// ──────────────────────────────────────────────��──────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────
electron_1.ipcMain.handle('ag:run', async (_evt, args) => {
    return new Promise((resolve) => {
        const cli = getCliPath();
        if (!fs_1.default.existsSync(cli)) {
            resolve({ code: -1, stdout: '', stderr: `CLI not found: ${cli}` });
            return;
        }
        const proc = (0, child_process_1.spawn)(process.execPath, [cli, ...args], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        proc.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
        proc.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
    });
});
electron_1.ipcMain.handle('ag:info', async () => {
    return {
        platform: process.platform,
        arch: process.arch,
        versions: process.versions,
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        cliPath: getCliPath(),
    };
});
electron_1.ipcMain.handle('ag:open-external', async (_evt, url) => {
    await electron_1.shell.openExternal(url);
});
electron_1.ipcMain.handle('ag:reveal', async (_evt, p) => {
    electron_1.shell.showItemInFolder(p);
});
// Streaming for `logs -f`
electron_1.ipcMain.handle('ag:stream:start', (evt, args, streamId) => {
    const cli = getCliPath();
    if (!fs_1.default.existsSync(cli)) {
        evt.sender.send(`ag:stream:${streamId}:error`, `CLI not found: ${cli}`);
        return false;
    }
    const proc = (0, child_process_1.spawn)(process.execPath, [cli, ...args], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
    });
    activeStreams.set(streamId, proc);
    proc.stdout.on('data', (d) => evt.sender.send(`ag:stream:${streamId}:data`, d.toString()));
    proc.stderr.on('data', (d) => evt.sender.send(`ag:stream:${streamId}:data`, d.toString()));
    proc.on('close', (code) => {
        evt.sender.send(`ag:stream:${streamId}:close`, code ?? 0);
        activeStreams.delete(streamId);
    });
    proc.on('error', (err) => {
        evt.sender.send(`ag:stream:${streamId}:error`, err.message);
        activeStreams.delete(streamId);
    });
    return true;
});
electron_1.ipcMain.handle('ag:stream:cancel', (_evt, streamId) => {
    const proc = activeStreams.get(streamId);
    if (proc) {
        proc.kill();
        activeStreams.delete(streamId);
        return true;
    }
    return false;
});
// ─────────────────────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    // Kill any active streams
    for (const proc of activeStreams.values())
        proc.kill();
    activeStreams.clear();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('web-contents-created', (_e, contents) => {
    // Enforce strict navigation policy
    contents.on('will-navigate', (event, url) => {
        const parsed = new URL(url);
        if (parsed.protocol !== 'file:') {
            event.preventDefault();
            electron_1.shell.openExternal(url);
        }
    });
});
//# sourceMappingURL=main.js.map