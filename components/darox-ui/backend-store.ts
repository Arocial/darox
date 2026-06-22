"use client";

import { create } from "zustand";

export type BackendStatus = "disconnected" | "connecting" | "connected";
export type BackendProcessStatus =
  | "stopped"
  | "starting"
  | "running"
  | "crashed";

type BackendState = {
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

/** Try to reach the backend HTTP endpoint. Updates store status accordingly. */
async function probeBackend(set: SetState, get: GetState) {
  const apiBase = get().apiBase;
  if (!apiBase || apiBase.endsWith(":0")) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${apiBase}/api/health`, {
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

function applyProcessStatus(
  statusStr: string,
  set: (partial: Partial<BackendState>) => void,
) {
  switch (statusStr) {
    case "Starting":
      set({ processStatus: "starting", status: "connecting" });
      break;
    case "Running":
      set({ processStatus: "running" });
      break;
    case "Stopped":
      set({ processStatus: "stopped", status: "disconnected" });
      break;
    case "Crashed":
      set({ processStatus: "crashed", status: "disconnected" });
      break;
  }
}

export const useBackendStore = create<BackendState>((set, get) => ({
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
      const port = await api.restartBackend();
      set({ port, apiBase: makeApiBase(port) });
    } catch (e) {
      console.error("Failed to restart backend", e);
      set({ processStatus: "crashed" });
    }
  },

  setupDesktopListeners: async () => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    if (!api) return;
    try {
      const unlisten = api.onBackendStatus((payload) => {
        const { status, port } = payload;
        if (port > 0) {
          set({ port, apiBase: makeApiBase(port) });
        }
        applyProcessStatus(status, set);
        if (status === "Running" && port > 0) {
          probeBackend(set, get);
        }
      });

      try {
        const result = await api.getBackendStatus();
        console.log(
          "[backend-store] get_backend_status result:",
          JSON.stringify(result),
        );
        const [status, port] = result;
        if (port > 0) {
          set({ port, apiBase: makeApiBase(port) });
        }
        const statusStr =
          typeof status === "string"
            ? status
            : (status as Record<string, unknown>).status || "Stopped";
        applyProcessStatus(statusStr as string, set);

        if (port > 0 && (statusStr === "Running" || statusStr === "Starting")) {
          await probeBackend(set, get);
        }
      } catch (e) {
        console.error("Failed to get initial backend status", e);
      }

      return unlisten;
    } catch (e) {
      console.error("Failed to setup desktop listeners", e);
    }
  },
}));
