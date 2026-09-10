import { contextBridge, ipcRenderer } from "electron";

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

interface BootstrapManagerConfig {
  name: string;
  url: string;
  token: string;
}

const darox = {
  // ── Dialogs ────────────────────────────────────────────────────────
  openDialog: (opts: OpenDialogOptions): Promise<OpenDialogResult> =>
    ipcRenderer.invoke("dialog:open", opts),
  getBootstrapManager: (): Promise<BootstrapManagerConfig | null> =>
    ipcRenderer.invoke("backend:get-bootstrap-manager"),
};

contextBridge.exposeInMainWorld("darox", darox);

export type DaroxApi = typeof darox;
