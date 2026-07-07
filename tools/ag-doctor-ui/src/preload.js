/**
 * Preload script — exposes a safe API to the renderer via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agDoctor', {
  // ─── ag-doctor command execution ────────────────────────────────────────
  run: (args, cwd) => ipcRenderer.invoke('ag-doctor:run', { args, cwd }),

  // Subscribe to streaming output
  onStdout: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ag-doctor:stdout', listener);
    return () => ipcRenderer.removeListener('ag-doctor:stdout', listener);
  },
  onStderr: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ag-doctor:stderr', listener);
    return () => ipcRenderer.removeListener('ag-doctor:stderr', listener);
  },

  // ─── Shell integration ──────────────────────────────────────────────────
  openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // ─── File dialogs ───────────────────────────────────────────────────────
  saveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
  openDialog: (options) => ipcRenderer.invoke('dialog:open', options),

  // ─── File I/O ───────────────────────────────────────────────────────────
  readFile: (path) => ipcRenderer.invoke('fs:read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:write-file', path, content),

  // ─── Window controls ────────────────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
});
