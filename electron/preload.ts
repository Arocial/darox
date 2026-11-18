import { contextBridge, ipcRenderer } from "electron";
import type {
  TurnNotificationInput,
  TurnNotificationTarget,
} from "./turn-notifications";

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
  saveManagerToken: (input: {
    url: string;
    token: string;
  }): Promise<{ cached: boolean; warning?: string }> =>
    ipcRenderer.invoke("backend:save-manager-token", input),
  getBootstrapManager: (): Promise<BootstrapManagerConfig | null> =>
    ipcRenderer.invoke("backend:get-bootstrap-manager"),
  showTurnNotification: (input: TurnNotificationInput): Promise<boolean> =>
    ipcRenderer.invoke("notification:show-turn", input),
  onTurnNotificationClick: (listener: () => void): (() => void) => {
    const handler = () => listener();
    ipcRenderer.on("notification:turn-click", handler);
    return () => ipcRenderer.removeListener("notification:turn-click", handler);
  },
  takeTurnNotificationTarget: (): Promise<TurnNotificationTarget | null> =>
    ipcRenderer.invoke("notification:take-turn-target"),
};

contextBridge.exposeInMainWorld("darox", darox);

export type DaroxApi = typeof darox;
