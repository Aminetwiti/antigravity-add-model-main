/**
 * Antigravity Doctor — Electron main process.
 *
 * Spawns the ag-doctor CLI as a child process and exposes its commands
 * to the renderer via IPC. Also handles window lifecycle, auto-updater,
 * and shell integration.
 */

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const isDev = process.argv.includes('--dev');

// Resolve paths relative to the project root (one level up from this app).
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AG_DOCTOR_ENTRY = path.join(PROJECT_ROOT, 'tools', 'ag-doctor', 'bin', 'ag-doctor.js');
const NODE_BIN = process.execPath; // Electron's bundled Node

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0e1a',
    title: 'Antigravity Doctor',
    icon: path.join(PROJECT_ROOT, 'assets', 'icons', 'icon.png'),
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0e1a',
      symbolColor: '#94a3b8',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide the default menu in production
  if (!isDev) {
    Menu.setApplicationMenu(null);
  }
}

// ─── IPC: Spawn ag-doctor commands ────────────────────────────────────────

/**
 * Run an ag-doctor command and stream output to the renderer.
 */
ipcMain.handle('ag-doctor:run', async (event, { args, cwd }) => {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_BIN, [AG_DOCTOR_ENTRY, ...args], {
      cwd: cwd || PROJECT_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable ANSI in stdout (renderer handles coloring)
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout += text;
      event.sender.send('ag-doctor:stdout', { args, text });
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      event.sender.send('ag-doctor:stderr', { args, text });
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        ok: code === 0,
      });
    });
  });
});

/**
 * Open a path in the OS file explorer.
 */
ipcMain.handle('shell:open-path', async (_event, p) => {
  return shell.openPath(p);
});

/**
 * Open an external URL in the default browser.
 */
ipcMain.handle('shell:open-external', async (_event, url) => {
  return shell.openExternal(url);
});

/**
 * Show a save dialog and return the chosen path.
 */
ipcMain.handle('dialog:save', async (_event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

/**
 * Show an open dialog and return the chosen path.
 */
ipcMain.handle('dialog:open', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

/**
 * Read a file (used for config editing).
 */
ipcMain.handle('fs:read-file', async (_event, filePath) => {
  return fs.promises.readFile(filePath, 'utf8');
});

/**
 * Write a file (used for config editing).
 */
ipcMain.handle('fs:write-file', async (_event, filePath, content) => {
  await fs.promises.writeFile(filePath, content, 'utf8');
  return true;
});

// ─── Window controls (custom titlebar) ────────────────────────────────────

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// ─── App lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
