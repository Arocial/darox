"use client";

import { create } from "zustand";
import {
  setCustomBackendAuth,
  setManagedBackendAuth,
} from "@/lib/backend-auth";

export type BackendStatus = "disconnected" | "connecting" | "connected";
export type BackendProcessStatus =
  | "stopped"
  | "starting"
  | "running"
  | "start-failed"
  | "crashed";
export type BackendId = `profile:${string}` | `custom:${string}`;

export interface InstanceState {
  status: string;
  port: number;
  host?: string;
  command?: string[];
  error?: BackendError;
}

export interface BackendError {
  kind: string;
  message: string;
  exitCode?: number | null;
  stderr?: string;
  occurredAt: string;
}

export interface CustomBackendConfig {
  id: string;
  name: string;
  url: string;
  token: string;
  rememberToken: boolean;
}

export type CustomBackendInput = Omit<CustomBackendConfig, "id"> & {
  id?: string;
};

type StoredCustomBackendConfig = Omit<CustomBackendConfig, "token">;

type BackendState = {
  activeBackendId: BackendId | null;
  activeProfile: string;
  profiles: string[];
  instances: Record<string, InstanceState>;
  customBackends: CustomBackendConfig[];
  managedExternalUrl: string;

  apiBase: string;
  port: number;
  status: BackendStatus;
  processStatus: BackendProcessStatus;

  probeBackend: () => Promise<void>;
  restartBackend: (profile?: string) => Promise<void>;
  switchBackend: (profile: string) => Promise<void>;
  closeBackend: (profile: string) => Promise<void>;
  connectCustomBackend: (config: CustomBackendInput) => Promise<boolean>;
  selectCustomBackend: (id?: string) => Promise<boolean>;
  disconnectCustomBackend: (id: string) => void;
  deleteCustomBackend: (id: string) => void;
  hydrateCustomBackends: () => void;
  setupDesktopListeners: () => Promise<(() => void) | undefined>;
};

const CUSTOM_BACKENDS_KEY = "darox_custom_backends_v1";
const CUSTOM_TOKENS_KEY = "darox_custom_backend_tokens_v1";
const CUSTOM_SESSION_TOKENS_KEY = "darox_custom_backend_session_tokens_v1";
const ACTIVE_CUSTOM_BACKEND_KEY = "darox_active_custom_backend_id";

const LEGACY_CUSTOM_URL_KEY = "darox_custom_backend_url";
const LEGACY_CUSTOM_TOKEN_KEY = "darox_custom_backend_token";
const LEGACY_CUSTOM_SESSION_TOKEN_KEY = "darox_custom_backend_session_token";
const LEGACY_CUSTOM_REMEMBER_KEY = "darox_custom_backend_remember_token";

export const isDesktop =
  typeof window !== "undefined" && typeof window.darox !== "undefined";

function makeApiBase(port: number): string {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `http://${hostname}:${port}`;
}

function normalizeUrl(value: string): string {
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return new URL(url).toString().replace(/\/$/, "");
}

function createCustomBackendId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function processStatusFromStr(status: string): BackendProcessStatus {
  if (status === "Starting") return "starting";
  if (status === "Running") return "running";
  if (status === "StartFailed") return "start-failed";
  if (status === "Crashed") return "crashed";
  return "stopped";
}

function readRecord(storage: Storage, key: string): Record<string, string> {
  try {
    const value = JSON.parse(storage.getItem(key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function persistCustomBackends(backends: CustomBackendConfig[]): void {
  const stored: StoredCustomBackendConfig[] = backends.map(
    ({ token: _token, ...backend }) => backend,
  );
  const persistentTokens: Record<string, string> = {};
  const sessionTokens: Record<string, string> = {};

  for (const backend of backends) {
    if (backend.rememberToken) persistentTokens[backend.id] = backend.token;
    else sessionTokens[backend.id] = backend.token;
  }

  localStorage.setItem(CUSTOM_BACKENDS_KEY, JSON.stringify(stored));
  localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(persistentTokens));
  sessionStorage.setItem(
    CUSTOM_SESSION_TOKENS_KEY,
    JSON.stringify(sessionTokens),
  );
}

function readStoredCustomBackends(): CustomBackendConfig[] {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CUSTOM_BACKENDS_KEY) || "[]",
    );
    if (!Array.isArray(stored)) return [];
    const persistentTokens = readRecord(localStorage, CUSTOM_TOKENS_KEY);
    const sessionTokens = readRecord(sessionStorage, CUSTOM_SESSION_TOKENS_KEY);

    return stored.flatMap((value): CustomBackendConfig[] => {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        typeof value.url !== "string"
      ) {
        return [];
      }
      const rememberToken = value.rememberToken === true;
      return [
        {
          id: value.id,
          name:
            typeof value.name === "string" && value.name.trim()
              ? value.name.trim()
              : value.url,
          url: value.url,
          rememberToken,
          token: rememberToken
            ? persistentTokens[value.id] || ""
            : sessionTokens[value.id] || "",
        },
      ];
    });
  } catch {
    return [];
  }
}

function migrateLegacyCustomBackend(): CustomBackendConfig[] {
  const url = localStorage.getItem(LEGACY_CUSTOM_URL_KEY);
  if (!url) return [];

  const id = createCustomBackendId();
  const rememberToken =
    localStorage.getItem(LEGACY_CUSTOM_REMEMBER_KEY) === "true";
  const backend: CustomBackendConfig = {
    id,
    name: url,
    url,
    rememberToken,
    token: rememberToken
      ? localStorage.getItem(LEGACY_CUSTOM_TOKEN_KEY) || ""
      : sessionStorage.getItem(LEGACY_CUSTOM_SESSION_TOKEN_KEY) || "",
  };

  persistCustomBackends([backend]);
  localStorage.setItem(ACTIVE_CUSTOM_BACKEND_KEY, id);
  localStorage.removeItem(LEGACY_CUSTOM_URL_KEY);
  localStorage.removeItem(LEGACY_CUSTOM_TOKEN_KEY);
  localStorage.removeItem(LEGACY_CUSTOM_REMEMBER_KEY);
  sessionStorage.removeItem(LEGACY_CUSTOM_SESSION_TOKEN_KEY);
  return [backend];
}

async function checkBackend(url: string, token: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${url}/api/sessions`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

let probeVersion = 0;

export const useBackendStore = create<BackendState>((set, get) => {
  const activateProfile = (
    profile: string,
    instances: Record<string, InstanceState>,
    externalUrl?: string,
  ) => {
    const instance = instances[profile];
    const processStatus = processStatusFromStr(instance?.status || "Stopped");
    setManagedBackendAuth();
    set({
      activeBackendId: `profile:${profile}`,
      activeProfile: profile,
      apiBase:
        externalUrl ||
        (profile === "external" && get().managedExternalUrl
          ? get().managedExternalUrl
          : makeApiBase(instance?.port || 0)),
      port: instance?.port || 0,
      processStatus,
      status: processStatus === "running" ? "connecting" : "disconnected",
    });
  };

  return {
    activeBackendId: null,
    activeProfile: "",
    profiles: [],
    instances: {},
    customBackends: [],
    managedExternalUrl: "",
    apiBase: makeApiBase(0),
    port: 0,
    status: "disconnected",
    processStatus: "stopped",

    probeBackend: async () => {
      const version = ++probeVersion;
      const { apiBase, activeBackendId, customBackends } = get();
      if (!activeBackendId || !apiBase || apiBase.endsWith(":0")) return;
      set({ status: "connecting" });
      const customId = activeBackendId.startsWith("custom:")
        ? activeBackendId.slice("custom:".length)
        : null;
      const token = customId
        ? customBackends.find((backend) => backend.id === customId)?.token || ""
        : window.darox?.getAuthToken?.() || "";
      const ok = await checkBackend(apiBase, token);
      if (
        version === probeVersion &&
        get().activeBackendId === activeBackendId
      ) {
        set({ status: ok ? "connected" : "disconnected" });
      }
    },

    restartBackend: async (profile) => {
      const api = window.darox;
      if (!api) return;
      const activeBackendId = get().activeBackendId;
      const target =
        profile ||
        (activeBackendId?.startsWith("profile:")
          ? activeBackendId.slice("profile:".length)
          : undefined);
      if (!target) return;
      if (get().activeBackendId === `profile:${target}`) {
        set({ processStatus: "starting", status: "connecting" });
      }
      try {
        await api.restartBackend(target);
      } catch (error) {
        console.error("Failed to restart backend", error);
      }
    },

    switchBackend: async (profile) => {
      const api = window.darox;
      if (!api) return;
      probeVersion++;
      activateProfile(profile, get().instances);
      set({ processStatus: "starting", status: "connecting" });
      try {
        await api.switchBackend(profile);
      } catch (error) {
        console.error("Failed to switch backend", error);
      }
    },

    closeBackend: async (profile) => {
      const api = window.darox;
      if (!api) return;
      await api.closeBackend(profile);
      if (get().activeBackendId === `profile:${profile}`) {
        set({ processStatus: "stopped", status: "disconnected" });
      }
    },

    connectCustomBackend: async (config) => {
      let url: string;
      try {
        url = normalizeUrl(config.url);
      } catch {
        return false;
      }
      const version = ++probeVersion;
      const previousStatus = get().status;
      const previousBackendId = get().activeBackendId;
      if (!previousBackendId || previousStatus === "disconnected") {
        set({ status: "connecting" });
      }
      const ok = await checkBackend(url, config.token);
      if (version !== probeVersion) return false;
      if (!ok) {
        if (!previousBackendId || previousStatus === "disconnected") {
          set({ status: "disconnected" });
        }
        return false;
      }

      const id = config.id || createCustomBackendId();
      const normalized: CustomBackendConfig = {
        ...config,
        id,
        name: config.name.trim() || url,
        url,
      };
      const customBackends = get().customBackends.some(
        (backend) => backend.id === id,
      )
        ? get().customBackends.map((backend) =>
            backend.id === id ? normalized : backend,
          )
        : [...get().customBackends, normalized];
      persistCustomBackends(customBackends);
      localStorage.setItem(ACTIVE_CUSTOM_BACKEND_KEY, id);
      setCustomBackendAuth(config.token);
      set({
        customBackends,
        activeBackendId: `custom:${id}`,
        activeProfile: "",
        apiBase: url,
        port:
          Number(new URL(url).port) || (url.startsWith("https:") ? 443 : 80),
        processStatus: "running",
        status: "connected",
      });
      return true;
    },

    selectCustomBackend: async (id) => {
      const targetId = id || localStorage.getItem(ACTIVE_CUSTOM_BACKEND_KEY);
      const config = get().customBackends.find(
        (backend) => backend.id === targetId,
      );
      if (!config) return false;
      return get().connectCustomBackend(config);
    },

    disconnectCustomBackend: (id) => {
      if (get().activeBackendId !== `custom:${id}`) return;
      probeVersion++;
      set({ status: "disconnected", processStatus: "stopped" });
    },

    deleteCustomBackend: (id) => {
      probeVersion++;
      const customBackends = get().customBackends.filter(
        (backend) => backend.id !== id,
      );
      persistCustomBackends(customBackends);
      if (localStorage.getItem(ACTIVE_CUSTOM_BACKEND_KEY) === id) {
        const replacementId = customBackends[0]?.id;
        if (replacementId) {
          localStorage.setItem(ACTIVE_CUSTOM_BACKEND_KEY, replacementId);
        } else {
          localStorage.removeItem(ACTIVE_CUSTOM_BACKEND_KEY);
        }
      }
      if (get().activeBackendId === `custom:${id}`) {
        setManagedBackendAuth();
        set({
          customBackends,
          activeBackendId: null,
          activeProfile: "",
          apiBase: makeApiBase(0),
          port: 0,
          status: "disconnected",
          processStatus: "stopped",
        });
      } else {
        set({ customBackends });
      }
    },

    hydrateCustomBackends: () => {
      const stored = readStoredCustomBackends();
      set({
        customBackends:
          stored.length > 0 ? stored : migrateLegacyCustomBackend(),
      });
    },

    setupDesktopListeners: async () => {
      const api = window.darox;
      if (!api) return;
      const applyPayload = (payload: any) => {
        const profiles: string[] = payload.profiles || [];
        const instances: Record<string, InstanceState> =
          payload.instances || {};
        set({
          profiles,
          instances,
          managedExternalUrl: payload.externalUrl || "",
        });
        const activeId = get().activeBackendId;
        if (activeId?.startsWith("custom:")) return;
        const profile = activeId?.startsWith("profile:")
          ? activeId.slice("profile:".length)
          : payload.activeProfile;
        if (!profile) return;
        activateProfile(profile, instances, payload.externalUrl);
        if (
          processStatusFromStr(instances[profile]?.status || "") === "running"
        ) {
          get().probeBackend();
        }
      };
      const unlisten = api.onBackendStatus(applyPayload);
      try {
        applyPayload(await api.getBackendStatus());
      } catch (error) {
        console.error("Failed to get initial backend status", error);
      }
      return unlisten;
    },
  };
});
