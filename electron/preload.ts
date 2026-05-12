import { contextBridge, ipcRenderer } from 'electron';

type Unsub = () => void;

const darox = {
  invoke: <T = unknown>(channel: string, args?: unknown) =>
    ipcRenderer.invoke(channel, args) as Promise<T>,

  on: (channel: string, cb: (payload: unknown) => void): Unsub => {
    const listener = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  },

  openDialog: (opts: unknown) =>
    ipcRenderer.invoke('dialog:open', opts) as Promise<{
      canceled: boolean;
      filePaths: string[];
    }>,
};

contextBridge.exposeInMainWorld('darox', darox);

export type DaroxApi = typeof darox;
