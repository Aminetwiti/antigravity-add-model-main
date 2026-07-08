"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Preload script — exposes a strictly whitelisted IPC bridge to the renderer.
 */
const electron_1 = require("electron");
const api = {
    run: (args) => electron_1.ipcRenderer.invoke('ag:run', args),
    info: () => electron_1.ipcRenderer.invoke('ag:info'),
    openExternal: (url) => electron_1.ipcRenderer.invoke('ag:open-external', url),
    reveal: (p) => electron_1.ipcRenderer.invoke('ag:reveal', p),
    startStream: (args, streamId) => electron_1.ipcRenderer.invoke('ag:stream:start', args, streamId),
    cancelStream: (streamId) => electron_1.ipcRenderer.invoke('ag:stream:cancel', streamId),
    onStreamData: (streamId, handler) => {
        const channel = `ag:stream:${streamId}:data`;
        const listener = (_, chunk) => handler(chunk);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
    onStreamClose: (streamId, handler) => {
        const channel = `ag:stream:${streamId}:close`;
        const listener = (_, code) => handler(code);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
    onStreamError: (streamId, handler) => {
        const channel = `ag:stream:${streamId}:error`;
        const listener = (_, err) => handler(err);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
};
electron_1.contextBridge.exposeInMainWorld('ag', api);
//# sourceMappingURL=preload.js.map