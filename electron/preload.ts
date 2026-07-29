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

export interface BackendStatusPayload {
  activeProfile: string;
  instances: Record<
    string,
    { status: string; port: number; exit_code?: number | null }
  >;
  profiles: string[];
}

const darox = {
  // ── Backend lifecycle ──────────────────────────────────────────────
  getAuthToken: (): string | undefined =>
    ipcRenderer.sendSync("get_auth_token"),
  restartBackend: (profile: string): Promise<number> =>
    ipcRenderer.invoke("restart_backend", profile),
  switchBackend: (profile: string): Promise<number> =>
    ipcRenderer.invoke("start_backend", profile),
  closeBackend: (profile: string): Promise<void> =>
    ipcRenderer.invoke("close_backend", profile),

  getBackendStatus: (): Promise<BackendStatusPayload> =>
    ipcRenderer.invoke("get_backend_status"),

  onBackendStatus: (cb: (payload: BackendStatusPayload) => void): Unsub => {
    const listener = (_e: unknown, payload: unknown) =>
      cb(payload as BackendStatusPayload);
    ipcRenderer.on("backend-status", listener);
    return () => ipcRenderer.off("backend-status", listener);
  },

  // ── Dialogs ────────────────────────────────────────────────────────
  openDialog: (opts: OpenDialogOptions): Promise<OpenDialogResult> =>
    ipcRenderer.invoke("dialog:open", opts),
};

contextBridge.exposeInMainWorld("darox", darox);

export type DaroxApi = typeof darox;
