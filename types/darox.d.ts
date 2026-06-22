export {};

type Unsub = () => void;

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

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

interface DaroxApi {
  // Backend lifecycle
  restartBackend(): Promise<number>;
  getBackendStatus(): Promise<BackendStatusTuple>;
  onBackendStatus(cb: (payload: BackendStatusPayload) => void): Unsub;

  // Find in page
  findInPage(opts: FindInPageOptions): Promise<unknown>;
  stopFindInPage(
    action?: "clearSelection" | "keepSelection" | "activateSelection",
  ): Promise<void>;
  onFoundInPage(cb: (result: FoundInPageResult) => void): Unsub;

  // Dialogs
  openDialog(opts: OpenDialogOptions): Promise<OpenDialogResult>;
}

declare global {
  interface Window {
    darox?: DaroxApi;
  }
}
