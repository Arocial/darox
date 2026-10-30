export {};

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

interface DaroxApi {
  // Dialogs
  openDialog(opts: OpenDialogOptions): Promise<OpenDialogResult>;
  getBootstrapManager(): Promise<BootstrapManagerConfig | null>;
  saveManagerToken(input: {
    url: string;
    token: string;
  }): Promise<{ cached: boolean; warning?: string }>;
}

interface BootstrapManagerConfig {
  name: string;
  url: string;
  token: string;
}

declare global {
  interface Window {
    darox?: DaroxApi;
  }
}
