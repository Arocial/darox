export {};

type Unsub = () => void;

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface DaroxApi {
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>;
  on(channel: string, cb: (payload: unknown) => void): Unsub;
  openDialog(opts: {
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
  }): Promise<OpenDialogResult>;
}

declare global {
  interface Window {
    darox?: DaroxApi;
  }
}
