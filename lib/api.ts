import { getBackendAuthToken } from "@/lib/backend-auth";

export async function daroxFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit,
): Promise<Response> {
  const token = getBackendAuthToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

export function appendWsToken(url: string): string {
  const token = getBackendAuthToken();
  if (!token) return url;
  const u = new URL(url);
  u.searchParams.set("token", token);
  return u.toString();
}
