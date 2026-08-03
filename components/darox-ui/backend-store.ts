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
export type BackendId = `profile:${string}` | "custom:default";

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
  url: string;
  token: string;
  rememberToken: boolean;
}

type BackendState = {
  activeBackendId: BackendId | null;
  activeProfile: string;
  profiles: string[];
  instances: Record<string, InstanceState>;
  customBackend: CustomBackendConfig | null;
  managedExternalUrl: string;

  apiBase: string;
  port: number;
  status: BackendStatus;
  processStatus: BackendProcessStatus;

  probeBackend: () => Promise<void>;
  restartBackend: (profile?: string) => Promise<void>;
  switchBackend: (profile: string) => Promise<void>;
  closeBackend: (profile: string) => Promise<void>;
  connectCustomBackend: (config: CustomBackendConfig) => Promise<boolean>;
  selectCustomBackend: () => Promise<boolean>;
  disconnectCustomBackend: () => void;
  hydrateCustomBackend: () => void;
  setupDesktopListeners: () => Promise<(() => void) | undefined>;
};

const CUSTOM_URL_KEY = "darox_custom_backend_url";
const CUSTOM_TOKEN_KEY = "darox_custom_backend_token";
const CUSTOM_SESSION_TOKEN_KEY = "darox_custom_backend_session_token";
const CUSTOM_REMEMBER_KEY = "darox_custom_backend_remember_token";

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

function processStatusFromStr(status: string): BackendProcessStatus {
  if (status === "Starting") return "starting";
  if (status === "Running") return "running";
  if (status === "StartFailed") return "start-failed";
  if (status === "Crashed") return "crashed";
  return "stopped";
}

async function checkBackend(url: string, token: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${url}/api/health`, {
      headers,
      signal: controller.signal,
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
    customBackend: null,
    managedExternalUrl: "",
    apiBase: makeApiBase(0),
    port: 0,
    status: "disconnected",
    processStatus: "stopped",

    probeBackend: async () => {
      const version = ++probeVersion;
      const { apiBase, activeBackendId, customBackend } = get();
      if (!activeBackendId || !apiBase || apiBase.endsWith(":0")) return;
      set({ status: "connecting" });
      const token =
        activeBackendId === "custom:default"
          ? customBackend?.token || ""
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
      const normalized = { ...config, url };
      localStorage.setItem(CUSTOM_URL_KEY, url);
      localStorage.setItem(CUSTOM_REMEMBER_KEY, String(config.rememberToken));
      if (config.rememberToken) {
        localStorage.setItem(CUSTOM_TOKEN_KEY, config.token);
        sessionStorage.removeItem(CUSTOM_SESSION_TOKEN_KEY);
      } else {
        localStorage.removeItem(CUSTOM_TOKEN_KEY);
        sessionStorage.setItem(CUSTOM_SESSION_TOKEN_KEY, config.token);
      }
      setCustomBackendAuth(config.token);
      set({
        customBackend: normalized,
        activeBackendId: "custom:default",
        activeProfile: "",
        apiBase: url,
        port:
          Number(new URL(url).port) || (url.startsWith("https:") ? 443 : 80),
        processStatus: "running",
        status: "connected",
      });
      return true;
    },

    selectCustomBackend: async () => {
      const config = get().customBackend;
      if (!config) return false;
      return get().connectCustomBackend(config);
    },

    disconnectCustomBackend: () => {
      if (get().activeBackendId !== "custom:default") return;
      probeVersion++;
      set({ status: "disconnected", processStatus: "stopped" });
    },

    hydrateCustomBackend: () => {
      const url = localStorage.getItem(CUSTOM_URL_KEY);
      if (!url) return;
      const rememberToken =
        localStorage.getItem(CUSTOM_REMEMBER_KEY) === "true";
      const token = rememberToken
        ? localStorage.getItem(CUSTOM_TOKEN_KEY) || ""
        : sessionStorage.getItem(CUSTOM_SESSION_TOKEN_KEY) || "";
      set({ customBackend: { url, token, rememberToken } });
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
        if (activeId === "custom:default") return;
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
