let customToken: string | undefined;
let useCustomToken = false;

export function setCustomBackendAuth(token?: string): void {
  customToken = token || undefined;
  useCustomToken = true;
}

export function setManagedBackendAuth(): void {
  customToken = undefined;
  useCustomToken = false;
}

export function getBackendAuthToken(): string | undefined {
  if (useCustomToken) return customToken;
  if (typeof window === "undefined") return undefined;
  return window.darox?.getAuthToken?.();
}
