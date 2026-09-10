let token: string | undefined;

export function setBackendAuthToken(value?: string): void {
  token = value || undefined;
}

export function getBackendAuthToken(): string | undefined {
  return token;
}
