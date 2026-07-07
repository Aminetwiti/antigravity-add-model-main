/**
 * Preload script — exposes a strictly whitelisted IPC bridge to the renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const api = {
  run: (args: string[]): Promise<RunResult> => ipcRenderer.invoke('ag:run', args),
  info: (): Promise<{
    platform: string;
    arch: string;
    versions: NodeJS.ProcessVersions;
    electron: string;
    node: string;
    chrome: string;
    cliPath: string;
  }> => ipcRenderer.invoke('ag:info'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('ag:open-external', url),
  reveal: (p: string): Promise<void> => ipcRenderer.invoke('ag:reveal', p),

  startStream: (args: string[], streamId: string): Promise<boolean> =>
    ipcRenderer.invoke('ag:stream:start', args, streamId),
  cancelStream: (streamId: string): Promise<boolean> =>
    ipcRenderer.invoke('ag:stream:cancel', streamId),
  onStreamData: (streamId: string, handler: (chunk: string) => void): (() => void) => {
    const channel = `ag:stream:${streamId}:data`;
    const listener = (_: unknown, chunk: string) => handler(chunk);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onStreamClose: (streamId: string, handler: (code: number) => void): (() => void) => {
    const channel = `ag:stream:${streamId}:close`;
    const listener = (_: unknown, code: number) => handler(code);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onStreamError: (streamId: string, handler: (err: string) => void): (() => void) => {
    const channel = `ag:stream:${streamId}:error`;
    const listener = (_: unknown, err: string) => handler(err);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('ag', api);

export type AgAPI = typeof api;
