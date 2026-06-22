import { contextBridge, ipcRenderer } from "electron";

type Unsub = () => void;

interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  properties?: Array<
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | "noResolveAliases"
    | "treatPackageAsDirectory"
    | "dontAddToRecent"
  >;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface FindInPageOptions {
  text: string;
  forward?: boolean;
  findNext?: boolean;
  matchCase?: boolean;
}

interface FoundInPageResult {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
}

interface BackendStatusPayload {
  status: string;
  port: number;
  exit_code?: number | null;
}

type BackendStatusTuple = [string | { status?: string }, number];

const darox = {
  // ── Backend lifecycle ──────────────────────────────────────────────
  restartBackend: (): Promise<number> => ipcRenderer.invoke("restart_backend"),

  getBackendStatus: (): Promise<BackendStatusTuple> =>
    ipcRenderer.invoke("get_backend_status"),

  onBackendStatus: (cb: (payload: BackendStatusPayload) => void): Unsub => {
    const listener = (_e: unknown, payload: unknown) =>
      cb(payload as BackendStatusPayload);
    ipcRenderer.on("backend-status", listener);
    return () => ipcRenderer.off("backend-status", listener);
  },

  // ── Find in page ───────────────────────────────────────────────────
  findInPage: (opts: FindInPageOptions): Promise<unknown> =>
    ipcRenderer.invoke("find:start", opts),

  stopFindInPage: (
    action?: "clearSelection" | "keepSelection" | "activateSelection",
  ): Promise<void> => ipcRenderer.invoke("find:stop", action),

  onFoundInPage: (cb: (result: FoundInPageResult) => void): Unsub => {
    const listener = (_e: unknown, payload: unknown) =>
      cb(payload as FoundInPageResult);
    ipcRenderer.on("found-in-page", listener);
    return () => ipcRenderer.off("found-in-page", listener);
  },

  // ── Dialogs ────────────────────────────────────────────────────────
  openDialog: (opts: OpenDialogOptions): Promise<OpenDialogResult> =>
    ipcRenderer.invoke("dialog:open", opts),
};

contextBridge.exposeInMainWorld("darox", darox);

export type DaroxApi = typeof darox;
