/**
 * Electron main process.
 * Creates the BrowserWindow, registers IPC handlers, and spawns the ag-doctor CLI.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
const activeStreams = new Map<string, ChildProcess>();

/**
 * Locate the ag-doctor CLI.
 * In dev: ../ag-doctor/bin/ag-doctor.js
 * In prod: bundled in resources/
 */
function getCliPath(): string {
  if (app.isPackaged) {
    // Bundled next to the app
    return path.join(process.resourcesPath, 'ag-doctor', 'bin', 'ag-doctor.js');
  }
  // Dev: sibling directory
  return path.join(__dirname, '..', '..', 'ag-doctor', 'bin', 'ag-doctor.js');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ──────────────────────────────────────────────��──────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('ag:run', async (_evt, args: string[]) => {
  return new Promise((resolve) => {
    const cli = getCliPath();
    if (!fs.existsSync(cli)) {
      resolve({ code: -1, stdout: '', stderr: `CLI not found: ${cli}` });
      return;
    }
    const proc = spawn(process.execPath, [cli, ...args], {
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

ipcMain.handle('ag:info', async () => {
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

ipcMain.handle('ag:open-external', async (_evt, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('ag:reveal', async (_evt, p: string) => {
  shell.showItemInFolder(p);
});

// Streaming for `logs -f`
ipcMain.handle('ag:stream:start', (evt, args: string[], streamId: string) => {
  const cli = getCliPath();
  if (!fs.existsSync(cli)) {
    evt.sender.send(`ag:stream:${streamId}:error`, `CLI not found: ${cli}`);
    return false;
  }
  const proc = spawn(process.execPath, [cli, ...args], {
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

ipcMain.handle('ag:stream:cancel', (_evt, streamId: string) => {
  const proc = activeStreams.get(streamId);
  if (proc) {
    proc.kill();
    activeStreams.delete(streamId);
    return true;
  }
  return false;
});

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Kill any active streams
  for (const proc of activeStreams.values()) proc.kill();
  activeStreams.clear();
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_e, contents) => {
  // Enforce strict navigation policy
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
