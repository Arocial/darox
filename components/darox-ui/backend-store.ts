"use client";
import { daroxFetch } from "@/lib/api";

import { create } from "zustand";

export type BackendStatus = "disconnected" | "connecting" | "connected";
export type BackendProcessStatus =
  | "stopped"
  | "starting"
  | "running"
  | "crashed";

export interface InstanceState {
  status: string;
  port: number;
  exit_code?: number | null;
}

type BackendState = {
  activeProfile: string;
  profiles: string[];
  instances: Record<string, InstanceState>;

  apiBase: string;
  port: number;
  status: BackendStatus;
  processStatus: BackendProcessStatus;

  setPort: (port: number) => void;
  setApiBase: (apiBase: string) => void;
  setStatus: (status: BackendStatus) => void;
  setProcessStatus: (status: BackendProcessStatus) => void;
  probeBackend: () => Promise<void>;
  restartBackend: () => Promise<void>;
  switchBackend: (profile: string) => Promise<void>;
  closeBackend: (profile: string) => Promise<void>;
  setupDesktopListeners: () => Promise<(() => void) | undefined>;
};

function makeApiBase(port: number): string {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `http://${hostname}:${port}`;
}

export const isDesktop =
  typeof window !== "undefined" && typeof window.darox !== "undefined";

type SetState = (partial: Partial<BackendState>) => void;
type GetState = () => BackendState;

async function probeBackend(set: SetState, get: GetState) {
  const apiBase = get().apiBase;
  if (!apiBase || apiBase.endsWith(":0")) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await daroxFetch(`${apiBase}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      set({ status: "connected" });
    } else {
      set({
        status: get().status === "connecting" ? "connecting" : "disconnected",
      });
    }
  } catch {
    set({
      status: get().status === "connecting" ? "connecting" : "disconnected",
    });
  }
}

function processStatusFromStr(statusStr: string): BackendProcessStatus {
  switch (statusStr) {
    case "Starting":
      return "starting";
    case "Running":
      return "running";
    case "Crashed":
      return "crashed";
    default:
      return "stopped";
  }
}

function applyPayload(payload: any, set: SetState, get: GetState) {
  const { activeProfile, instances, profiles, externalUrl } = payload;
  const inst = instances[activeProfile];
  const port = inst?.port || 0;
  const statusStr = inst?.status || "Stopped";
  const procStatus = processStatusFromStr(statusStr);

  set({
    activeProfile,
    instances,
    profiles,
    port,
    apiBase: externalUrl || makeApiBase(port),
    processStatus: procStatus,
    status: procStatus === "running" ? "connecting" : "disconnected",
  });

  if (procStatus === "running" && (port > 0 || externalUrl)) {
    probeBackend(set, get);
  }
}

export const useBackendStore = create<BackendState>((set, get) => ({
  activeProfile: "coder",
  profiles: [],
  instances: {},

  apiBase: makeApiBase(0),
  port: 0,
  status: "disconnected",
  processStatus: "stopped",

  setPort: (port) => set({ port, apiBase: makeApiBase(port) }),
  setApiBase: (apiBase) => set({ apiBase }),
  setStatus: (status) => set({ status }),
  setProcessStatus: (processStatus) => set({ processStatus }),

  probeBackend: async () => {
    await probeBackend(set, get);
  },

  restartBackend: async () => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    if (!api) return;
    try {
      set({ processStatus: "starting", status: "connecting" });
      await api.restartBackend();
      // payload will be pushed via onBackendStatus
    } catch (e) {
      console.error("Failed to restart backend", e);
      set({ processStatus: "crashed" });
    }
  },

  switchBackend: async (profile: string) => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    if (!api) return;
    try {
      set({ processStatus: "starting", status: "connecting" });
      await api.switchBackend(profile);
    } catch (e) {
      console.error("Failed to switch backend", e);
    }
  },

  closeBackend: async (profile: string) => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    if (!api) return;
    try {
      await api.closeBackend(profile);
    } catch (e) {
      console.error("Failed to close backend", e);
    }
  },

  setupDesktopListeners: async () => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    if (!api) return;
    try {
      const unlisten = api.onBackendStatus((payload) => {
        applyPayload(payload, set, get);
      });

      try {
        const payload = await api.getBackendStatus();
        applyPayload(payload, set, get);
      } catch (e) {
        console.error("Failed to get initial backend status", e);
      }

      return unlisten;
    } catch (e) {
      console.error("Failed to setup desktop listeners", e);
    }
  },
}));
