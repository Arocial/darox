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

interface DaroxApi {
  // Backend lifecycle
  getAuthToken(): string | undefined;
  restartBackend(): Promise<number>;
  switchBackend(profile: string): Promise<number>;
  closeBackend(profile: string): Promise<void>;
  getBackendStatus(): Promise<any>;
  onBackendStatus(cb: (payload: any) => void): Unsub;

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
