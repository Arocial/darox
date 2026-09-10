export type ProfileStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed";

export interface ProfileView {
  id: string;
  autostart: boolean;
  status: ProfileStatus;
  started_at: string | null;
  exit_code: number | null;
  last_error: string | null;
}

export interface ManagerConfig {
  id: string;
  name: string;
  url: string;
  token: string;
  rememberToken: boolean;
}

export class ManagerHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeManagerUrl(value: string): string {
  const url = new URL(
    /^https?:\/\//i.test(value.trim())
      ? value.trim()
      : `http://${value.trim()}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use an HTTP or HTTPS Manager URL without credentials, query parameters, or a fragment.",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export function profileApiBase(
  manager: ManagerConfig,
  profile: string,
): string {
  return `${manager.url}/api/profiles/${encodeURIComponent(profile)}/proxy`;
}

export async function managerRequest<T>(
  manager: ManagerConfig,
  path: string,
  method = "GET",
): Promise<T> {
  const headers = new Headers();
  if (manager.token) headers.set("Authorization", `Bearer ${manager.token}`);
  const response = await fetch(`${manager.url}/api/profiles${path}`, {
    method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).detail || "";
    } catch {}
    throw new ManagerHttpError(
      response.status,
      response.status === 401
        ? "Manager authentication failed. Check the API token."
        : response.status === 409
          ? "Another profile operation is in progress. Wait for it to finish."
          : `Manager request failed (${response.status})${typeof detail === "string" && detail ? `: ${detail}` : "."}`,
    );
  }
  return response.json();
}

export async function listProfiles(
  manager: ManagerConfig,
): Promise<ProfileView[]> {
  const profiles = await managerRequest<ProfileView[]>(manager, "");
  if (
    !Array.isArray(profiles) ||
    !profiles.every(
      (profile) =>
        profile &&
        typeof profile.id === "string" &&
        /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(profile.id) &&
        ["stopped", "starting", "running", "stopping", "failed"].includes(
          profile.status,
        ),
    )
  )
    throw new Error("This URL did not return an Arox Manager profile list.");
  return profiles;
}
