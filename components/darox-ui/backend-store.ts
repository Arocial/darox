'use client';

import { create } from 'zustand';

export type BackendStatus = 'disconnected' | 'connecting' | 'connected';
export type BackendProcessStatus = 'stopped' | 'starting' | 'running' | 'crashed';

type BackendState = {
  apiBase: string;
  port: number;
  status: BackendStatus;
  processStatus: BackendProcessStatus;

  setPort: (port: number) => void;
  setStatus: (status: BackendStatus) => void;
  setProcessStatus: (status: BackendProcessStatus) => void;
  startHealthCheck: () => void;
  stopHealthCheck: () => void;
  restartBackend: () => Promise<void>;
  setupTauriListeners: () => Promise<(() => void) | void>;
};

function makeApiBase(port: number): string {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  return `http://${hostname}:${port}`;
}

const isTauri =
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

type SetState = (partial: Partial<BackendState>) => void;
type GetState = () => BackendState;

/** Try to reach the backend HTTP endpoint. Updates store status accordingly. */
async function probeBackend(port: number, set: SetState, get: GetState) {
  if (port === 0) return;
  const apiBase = makeApiBase(port);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${apiBase}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      set({ status: 'connected' });
    } else {
      set({
        status: get().status === 'connecting' ? 'connecting' : 'disconnected',
      });
    }
  } catch {
    set({
      status: get().status === 'connecting' ? 'connecting' : 'disconnected',
    });
  }
}

function applyProcessStatus(
  statusStr: string,
  set: (partial: Partial<BackendState>) => void,
) {
  switch (statusStr) {
    case 'Starting':
      set({ processStatus: 'starting', status: 'connecting' });
      break;
    case 'Running':
      set({ processStatus: 'running' });
      break;
    case 'Stopped':
      set({ processStatus: 'stopped', status: 'disconnected' });
      break;
    case 'Crashed':
      set({ processStatus: 'crashed', status: 'disconnected' });
      break;
  }
}

export const useBackendStore = create<BackendState>((set, get) => ({
  apiBase: makeApiBase(0),
  port: 0,
  status: 'disconnected',
  processStatus: 'stopped',

  setPort: (port) => set({ port, apiBase: makeApiBase(port) }),

  setStatus: (status) => set({ status }),
  setProcessStatus: (processStatus) => set({ processStatus }),

  startHealthCheck: () => {
    if (healthCheckInterval) return;
    const check = () => probeBackend(get().port, set, get);
    check();
    healthCheckInterval = setInterval(check, 5000);
  },

  stopHealthCheck: () => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
  },

  restartBackend: async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      set({ processStatus: 'starting', status: 'connecting' });
      const port = await invoke<number>('restart_backend');
      set({ port, apiBase: makeApiBase(port) });
    } catch (e) {
      console.error('Failed to restart backend', e);
      set({ processStatus: 'crashed' });
    }
  },

  setupTauriListeners: async () => {
    if (!isTauri) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');

      // Listen for future status changes
      const unlisten = await listen<{ status: string; port: number; exit_code?: number }>(
        'backend-status',
        (event) => {
          const { status, port } = event.payload;
          if (port > 0) {
            set({ port, apiBase: makeApiBase(port) });
          }
          applyProcessStatus(status, set);
          // When backend reports Running, immediately probe HTTP
          if (status === 'Running' && port > 0) {
            probeBackend(port, set, get);
          }
        },
      );

      // Sync current status in case events fired before listener was ready
      try {
        const result = await invoke<[string | Record<string, unknown>, number]>('get_backend_status');
        console.log('[backend-store] get_backend_status result:', JSON.stringify(result));
        const [status, port] = result;
        if (port > 0) {
          set({ port, apiBase: makeApiBase(port) });
        }
        const statusStr = typeof status === 'string' ? status : Object.keys(status)[0] || 'Stopped';
        applyProcessStatus(statusStr, set);

        // If backend is already starting/running, probe HTTP immediately
        if (port > 0 && (statusStr === 'Running' || statusStr === 'Starting')) {
          await probeBackend(port, set, get);
        }
      } catch (e) {
        console.error('Failed to get initial backend status', e);
      }

      return unlisten;
    } catch (e) {
      console.error('Failed to setup Tauri listeners', e);
    }
  },
}));
