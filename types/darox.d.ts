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

interface DaroxApi {
  // Backend lifecycle
  getAuthToken(): string | undefined;
  restartBackend(profile: string): Promise<number>;
  switchBackend(profile: string): Promise<number>;
  closeBackend(profile: string): Promise<void>;
  getBackendStatus(): Promise<any>;
  onBackendStatus(cb: (payload: any) => void): Unsub;
  getProfileLaunchSettings(profile: string): Promise<{
    command: string;
    commonArgs: string[];
    extraArgs: string[];
    host: string;
    port: number | "auto";
    startupTimeoutMs: number;
  }>;
  updateProfileArgs(
    profile: string,
    args: string[],
  ): Promise<{
    command: string;
    commonArgs: string[];
    extraArgs: string[];
    host: string;
    port: number | "auto";
    startupTimeoutMs: number;
  }>;

  // Dialogs
  openDialog(opts: OpenDialogOptions): Promise<OpenDialogResult>;
}

declare global {
  interface Window {
    darox?: DaroxApi;
  }
}
