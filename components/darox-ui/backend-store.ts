"use client";

import { create } from "zustand";
import { setBackendAuthToken } from "@/lib/backend-auth";
import { createUuid } from "@/lib/id";
import {
  listProfiles,
  managerRequest,
  normalizeManagerUrl,
  profileApiBase,
  type ManagerConfig,
  type ProfileView,
} from "@/lib/manager-client";

export type { ManagerConfig } from "@/lib/manager-client";
export type BackendStatus = "disconnected" | "connecting" | "connected";
interface BackendManagerConfig extends ManagerConfig {
  electronManaged?: boolean;
}
type ProfileAction = "start" | "stop" | "restart";
export interface ManagerConnection {
  status: BackendStatus;
  profiles: ProfileView[];
  error?: string;
}

interface BackendState {
  managers: BackendManagerConfig[];
  connections: Record<string, ManagerConnection>;
  pending: Record<string, ProfileAction>;
  activeManagerId: string | null;
  activeProfile: string;
  activeBackendId: string | null;
  apiBase: string;
  status: BackendStatus;
  hydrated: boolean;
  connectionRevision: number;
  saveManager: (
    input: Omit<ManagerConfig, "id"> & { id?: string },
  ) => Promise<void>;
  deleteManager: (id: string) => void;
  refreshManager: (id: string) => Promise<void>;
  selectProfile: (managerId: string, profileId: string) => Promise<void>;
  profileAction: (
    managerId: string,
    profileId: string,
    action: ProfileAction,
  ) => Promise<void>;
  initialize: () => () => void;
}

const MANAGERS_KEY = "darox_managers_v1";
const TOKENS_KEY = "darox_manager_tokens_v1";
const SESSION_TOKENS_KEY = "darox_manager_session_tokens_v1";
const SELECTION_KEY = "darox_manager_selection_v1";
const ELECTRON_MANAGER_ID = "electron-default";

function readJson(storage: Storage, key: string, fallback: unknown): any {
  try {
    return JSON.parse(storage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function persist(managers: BackendManagerConfig[]) {
  const persistentManagers = managers.filter((m) => !m.electronManaged);
  localStorage.setItem(
    MANAGERS_KEY,
    JSON.stringify(
      persistentManagers.map(({ token: _token, ...manager }) => manager),
    ),
  );
  localStorage.setItem(
    TOKENS_KEY,
    JSON.stringify(
      Object.fromEntries(
        persistentManagers
          .filter((m) => m.rememberToken)
          .map((m) => [m.id, m.token]),
      ),
    ),
  );
  sessionStorage.setItem(
    SESSION_TOKENS_KEY,
    JSON.stringify(
      Object.fromEntries(
        persistentManagers
          .filter((m) => !m.rememberToken)
          .map((m) => [m.id, m.token]),
      ),
    ),
  );
}

function readManagers(): ManagerConfig[] {
  const stored = readJson(localStorage, MANAGERS_KEY, []);
  const tokens = readJson(localStorage, TOKENS_KEY, {});
  const sessionTokens = readJson(sessionStorage, SESSION_TOKENS_KEY, {});
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((manager): ManagerConfig[] => {
    if (
      !manager ||
      typeof manager.id !== "string" ||
      typeof manager.url !== "string" ||
      typeof manager.name !== "string"
    )
      return [];
    try {
      const token = (manager.rememberToken ? tokens : sessionTokens)?.[
        manager.id
      ];
      return [
        {
          id: manager.id,
          name: manager.name,
          url: normalizeManagerUrl(manager.url),
          rememberToken: manager.rememberToken === true,
          token: typeof token === "string" ? token : "",
        },
      ];
    } catch {
      return [];
    }
  });
}

export function profileKey(managerId: string, profileId: string): string {
  return `${managerId}:${profileId}`;
}

export const useBackendStore = create<BackendState>((set, get) => {
  const versions = new Map<string, number>();
  let initialized = false;
  let pollingUsers = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let pollGeneration = 0;
  let lastExecution: string | null = null;

  const syncActive = () => {
    const state = get();
    const manager = state.managers.find((m) => m.id === state.activeManagerId);
    const connection = manager ? state.connections[manager.id] : undefined;
    const profile = connection?.profiles.find(
      (p) => p.id === state.activeProfile,
    );
    const activeBackendId =
      manager && profile ? profileKey(manager.id, profile.id) : null;
    const execution =
      activeBackendId && profile?.status === "running"
        ? `${activeBackendId}:${profile.started_at}`
        : null;
    const changedExecution =
      execution !== null &&
      lastExecution !== null &&
      execution !== lastExecution;
    if (execution) lastExecution = execution;
    setBackendAuthToken(manager?.token);
    set({
      activeBackendId,
      apiBase: manager && profile ? profileApiBase(manager, profile.id) : "",
      status:
        connection?.status === "connected" && profile?.status === "running"
          ? "connected"
          : connection?.status === "connecting" ||
              (connection?.status === "connected" &&
                (profile?.status === "starting" ||
                  profile?.status === "stopping"))
            ? "connecting"
            : "disconnected",
      connectionRevision: state.connectionRevision + (changedExecution ? 1 : 0),
    });
  };

  const select = (managerId: string | null, profileId: string) => {
    set({ activeManagerId: managerId, activeProfile: profileId });
    localStorage.setItem(
      SELECTION_KEY,
      JSON.stringify({ managerId, profileId }),
    );
    syncActive();
  };

  const applyProfiles = (manager: ManagerConfig, profiles: ProfileView[]) => {
    set((state) => ({
      connections: {
        ...state.connections,
        [manager.id]: { status: "connected", profiles },
      },
    }));
    if (
      get().activeManagerId === manager.id &&
      !profiles.some((p) => p.id === get().activeProfile)
    ) {
      select(
        manager.id,
        (profiles.find((p) => p.status === "running") || profiles[0])?.id || "",
      );
    } else syncActive();
  };

  return {
    managers: [],
    connections: {},
    pending: {},
    activeManagerId: null,
    activeProfile: "",
    activeBackendId: null,
    apiBase: "",
    status: "disconnected",
    hydrated: false,
    connectionRevision: 0,

    saveManager: async (input) => {
      const original = input.id
        ? get().managers.find((m) => m.id === input.id)
        : undefined;
      const manager: ManagerConfig = {
        ...input,
        id: input.id || createUuid(),
        url: normalizeManagerUrl(input.url),
        name: input.name.trim() || input.url.trim(),
        ...(original?.electronManaged ? { electronManaged: true } : {}),
      };
      const profiles = await listProfiles(manager);
      if (
        input.id &&
        get().managers.find((m) => m.id === input.id) !== original
      )
        throw new Error("This Manager connection changed. Please try again.");
      const managers = original
        ? get().managers.map((m) => (m.id === manager.id ? manager : m))
        : [...get().managers, manager];
      persist(managers);
      set({ managers, connectionRevision: get().connectionRevision + 1 });
      applyProfiles(manager, profiles);
      select(
        manager.id,
        profiles.find((p) => p.id === get().activeProfile)?.id ||
          (profiles.find((p) => p.status === "running") || profiles[0])?.id ||
          "",
      );
    },

    deleteManager: (id) => {
      const managers = get().managers.filter((m) => m.id !== id);
      const connections = { ...get().connections };
      delete connections[id];
      persist(managers);
      set({ managers, connections });
      if (get().activeManagerId === id) {
        const manager = managers[0];
        const profiles = manager ? connections[manager.id]?.profiles || [] : [];
        select(
          manager?.id || null,
          (profiles.find((p) => p.status === "running") || profiles[0])?.id ||
            "",
        );
      }
    },

    refreshManager: async (id) => {
      const manager = get().managers.find((m) => m.id === id);
      if (!manager) return;
      const version = (versions.get(id) || 0) + 1;
      versions.set(id, version);
      try {
        const profiles = await listProfiles(manager);
        if (
          versions.get(id) !== version ||
          get().managers.find((m) => m.id === id) !== manager
        )
          return;
        applyProfiles(manager, profiles);
      } catch (error) {
        if (
          versions.get(id) !== version ||
          get().managers.find((m) => m.id === id) !== manager
        )
          return;
        set((state) => ({
          connections: {
            ...state.connections,
            [id]: {
              status: "disconnected",
              profiles: state.connections[id]?.profiles || [],
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to reach Manager.",
            },
          },
        }));
        syncActive();
      }
    },

    selectProfile: async (managerId, profileId) => {
      const profile = get().connections[managerId]?.profiles.find(
        (p) => p.id === profileId,
      );
      if (!profile) return;
      select(managerId, profileId);
      if (profile.status === "stopped" || profile.status === "failed")
        await get().profileAction(managerId, profileId, "start");
    },

    profileAction: async (managerId, profileId, action) => {
      const manager = get().managers.find((m) => m.id === managerId);
      const key = profileKey(managerId, profileId);
      if (!manager || get().pending[key]) return;
      set((state) => ({ pending: { ...state.pending, [key]: action } }));
      try {
        const accepted = await managerRequest<ProfileView>(
          manager,
          `/${encodeURIComponent(profileId)}/${action}`,
          "POST",
        );
        if (get().managers.find((m) => m.id === managerId) !== manager) return;
        versions.set(managerId, (versions.get(managerId) || 0) + 1);
        applyProfiles(
          manager,
          (get().connections[managerId]?.profiles || []).map((p) =>
            p.id === profileId ? accepted : p,
          ),
        );
        // A 202 acknowledges the operation; only a subsequent terminal view completes it.
        const deadline = Date.now() + 45000;
        while (get().managers.find((m) => m.id === managerId) === manager) {
          await get().refreshManager(managerId);
          const connection = get().connections[managerId];
          if (connection?.status !== "connected")
            throw new Error(connection?.error || "Manager disconnected.");
          const profile = connection.profiles.find((p) => p.id === profileId);
          if (!profile)
            throw new Error("Profile is no longer configured in this Manager.");
          if (profile.status === "failed")
            throw new Error(profile.last_error || "Profile operation failed.");
          if (profile.status === (action === "stop" ? "stopped" : "running"))
            return;
          if (Date.now() >= deadline)
            throw new Error(
              "Profile operation is still pending. Its status will continue to refresh.",
            );
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } finally {
        const pending = { ...get().pending };
        delete pending[key];
        set({ pending });
        await get().refreshManager(managerId);
      }
    },

    initialize: () => {
      if (!initialized) {
        initialized = true;
        void (async () => {
          const storedManagers = readManagers();
          let electronManager: BackendManagerConfig | undefined;
          try {
            const bootstrap = await window.darox?.getBootstrapManager();
            if (bootstrap) {
              electronManager = {
                id: ELECTRON_MANAGER_ID,
                name: bootstrap.name.trim() || "Default",
                url: normalizeManagerUrl(bootstrap.url),
                token: bootstrap.token,
                rememberToken: false,
                electronManaged: true,
              };
            }
          } catch (error) {
            console.error(
              "Unable to load Electron Manager configuration",
              error,
            );
          }
          const managers = electronManager
            ? [
                ...storedManagers.filter((m) => m.id !== ELECTRON_MANAGER_ID),
                electronManager,
              ]
            : storedManagers;
          const selection = readJson(localStorage, SELECTION_KEY, {});
          const manager =
            managers.find((m) => m.id === selection?.managerId) ||
            electronManager ||
            managers[0];
          set({
            managers,
            connections: Object.fromEntries(
              managers.map((m) => [
                m.id,
                { status: "connecting", profiles: [] },
              ]),
            ),
            hydrated: true,
          });
          select(
            manager?.id || null,
            typeof selection?.profileId === "string" ? selection.profileId : "",
          );
          if (pollingUsers) startPolling();
        })();
      }
      pollingUsers++;
      if (pollingUsers === 1 && get().hydrated) startPolling();
      return () => {
        pollingUsers--;
        if (!pollingUsers) {
          pollGeneration++;
          clearTimeout(pollTimer);
        }
      };
    },
  };

  function startPolling() {
    if (!pollingUsers) return;
    const generation = ++pollGeneration;
    const poll = async () => {
      await Promise.allSettled(
        get().managers.map((m) => get().refreshManager(m.id)),
      );
      if (pollingUsers && generation === pollGeneration)
        pollTimer = setTimeout(poll, 2000);
    };
    void poll();
  }
});
