"use client";
import { daroxFetch } from "@/lib/api";

import { create } from "zustand";
import { useBackendStore } from "@/components/darox-ui/backend-store";

export type AgentTab = {
  id: string;
  path: string[];
  name: string;
  status: string;
  workspace: string;
  subagents: AgentTab[];
};

export type SessionInfo = {
  id: string;
  path: string[];
  agent_name: string;
  workspace: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  active: boolean;
  task_name: string | null;
  target: string | null;
  result: unknown;
  error: unknown;
  children: SessionInfo[];
};

export function sessionToAgentTab(session: SessionInfo): AgentTab {
  return {
    id: session.id,
    path: session.path,
    name: session.agent_name,
    status: session.active ? "active" : "idle",
    workspace: session.workspace || "",
    subagents: session.children.map(sessionToAgentTab),
  };
}

export function containsSession(tab: AgentTab, sessionPath: string): boolean {
  return (
    tab.path.join("/") === sessionPath ||
    tab.subagents.some((child) => containsSession(child, sessionPath))
  );
}

type AgentWorkspace = {
  tabs: AgentTab[];
  activeId: string | null;
  sessions: SessionInfo[];
  closingSessionIds: ReadonlyMap<string, symbol>;
  completionUnread: Record<string, Record<string, boolean>>;
  isBusy: Record<string, Record<string, boolean>>;
};

type AgentTabsState = AgentWorkspace & {
  loading: boolean;
  backendWorkspaces: Record<string, AgentWorkspace>;
  notificationSelection: { rootId: string; sessionPath: string } | null;

  setActiveId: (id: string) => void;
  focusSession: (tab: AgentTab, sessionPath: string) => void;
  consumeNotificationSelection: (
    selection: NonNullable<AgentTabsState["notificationSelection"]>,
  ) => void;
  setCompletionUnread: (
    sessionId: string,
    agentName: string,
    unread: boolean,
  ) => void;
  clearCompletionUnread: (sessionId: string) => void;
  setBusy: (sessionId: string, agentName: string, busy: boolean) => void;

  createAgent: (workspace: string) => Promise<AgentTab | null>;
  deleteAgent: (id: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  loadSessions: () => Promise<void>;
  loadAgents: () => Promise<void>;
  openSession: (sessionId: string) => Promise<AgentTab | null>;
  updateAgent: (agent: AgentTab) => void;
  clearAgents: () => void;
};

function activeBackendRequestContext() {
  const { apiBase, activeBackendId, connectionRevision } =
    useBackendStore.getState();
  return {
    apiBase,
    activeBackendId,
    isCurrent: () => {
      const current = useBackendStore.getState();
      return (
        current.activeBackendId === activeBackendId &&
        current.apiBase === apiBase &&
        current.connectionRevision === connectionRevision
      );
    },
  };
}

// A list requested before a successful stop may still report the session active.
const sessionListVersions = new Map<string | null, number>();

function sessionListRequestContext() {
  const { apiBase, activeBackendId, isCurrent } = activeBackendRequestContext();
  const version = sessionListVersions.get(activeBackendId);
  return {
    apiBase,
    isCurrent: () =>
      isCurrent() && sessionListVersions.get(activeBackendId) === version,
  };
}

function settleClose(workspace: AgentWorkspace, id: string, stopped: boolean) {
  const closingSessionIds = new Map(workspace.closingSessionIds);
  closingSessionIds.delete(id);
  if (!stopped) {
    return {
      closingSessionIds,
      activeId:
        workspace.activeId ??
        (workspace.tabs.some((tab) => tab.id === id) ? id : null),
    };
  }
  const completionUnread = { ...workspace.completionUnread };
  const isBusy = { ...workspace.isBusy };
  delete completionUnread[id];
  delete isBusy[id];
  return {
    closingSessionIds,
    tabs: workspace.tabs.filter((tab) => tab.id !== id),
    sessions: workspace.sessions.map((session) =>
      session.id === id ? { ...session, active: false } : session,
    ),
    completionUnread,
    isBusy,
  };
}

export const useAgentTabs = create<AgentTabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  loading: false,
  sessions: [],
  closingSessionIds: new Map(),
  completionUnread: {},
  isBusy: {},
  backendWorkspaces: {},
  notificationSelection: null,

  setActiveId: (id) =>
    set((state) => {
      if (state.closingSessionIds.has(id)) return state;
      const nextCompletionUnread = { ...state.completionUnread };
      delete nextCompletionUnread[id];
      return {
        activeId: id,
        completionUnread: nextCompletionUnread,
        notificationSelection: null,
      };
    }),

  focusSession: (tab, sessionPath) =>
    set((state) => {
      if (state.closingSessionIds.has(tab.id)) return state;
      const existing = state.tabs.find((item) => item.id === tab.id);
      const completionUnread = { ...state.completionUnread };
      delete completionUnread[tab.id];
      return {
        tabs: !existing
          ? [...state.tabs, tab]
          : containsSession(existing, sessionPath)
            ? state.tabs
            : state.tabs.map((item) => (item.id === tab.id ? tab : item)),
        activeId: tab.id,
        completionUnread,
        notificationSelection: { rootId: tab.id, sessionPath },
      };
    }),

  consumeNotificationSelection: (selection) =>
    set((state) =>
      state.notificationSelection === selection
        ? { notificationSelection: null }
        : state,
    ),

  setCompletionUnread: (sessionId, agentName, unread) =>
    set((state) => {
      const sessionCompletion = state.completionUnread[sessionId] || {};
      if (sessionCompletion[agentName] === unread) return state;
      return {
        completionUnread: {
          ...state.completionUnread,
          [sessionId]: {
            ...sessionCompletion,
            [agentName]: unread,
          },
        },
      };
    }),

  clearCompletionUnread: (sessionId) =>
    set((state) => {
      if (!state.completionUnread[sessionId]) return state;
      const nextCompletionUnread = { ...state.completionUnread };
      delete nextCompletionUnread[sessionId];
      return { completionUnread: nextCompletionUnread };
    }),

  setBusy: (sessionId, agentName, busy) =>
    set((state) => {
      const sessionBusy = state.isBusy[sessionId] || {};
      if (sessionBusy[agentName] === busy) return state;
      return {
        isBusy: {
          ...state.isBusy,
          [sessionId]: {
            ...sessionBusy,
            [agentName]: busy,
          },
        },
      };
    }),

  createAgent: async (workspace: string) => {
    try {
      const { apiBase, isCurrent } = activeBackendRequestContext();
      const res = await daroxFetch(`${apiBase}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      const tab = sessionToAgentTab(await res.json());
      if (!isCurrent()) return null;
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeId: tab.id,
      }));
      return tab;
    } catch (e) {
      console.error("Failed to create agent", e);
      return null;
    }
  },

  deleteAgent: async (id: string) => {
    const { apiBase, activeBackendId } = activeBackendRequestContext();
    if (get().closingSessionIds.has(id)) return true;
    const request = Symbol();
    // Keep the chat mounted until the stop succeeds so a failure can restore it.
    set((state) => ({
      closingSessionIds: new Map(state.closingSessionIds).set(id, request),
      activeId:
        state.activeId === id
          ? (state.tabs.find(
              (tab) => tab.id !== id && !state.closingSessionIds.has(tab.id),
            )?.id ?? null)
          : state.activeId,
      notificationSelection:
        state.notificationSelection?.rootId === id
          ? null
          : state.notificationSelection,
    }));

    let stopped = false;
    try {
      const res = await daroxFetch(`${apiBase}/api/sessions/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to stop session");
      stopped = true;
    } catch (error) {
      console.error("Failed to stop session", error);
    }

    const state = get();
    const backend = useBackendStore.getState();
    const current =
      backend.activeBackendId === activeBackendId &&
      backend.apiBase === apiBase;
    const workspace = current
      ? state
      : activeBackendId
        ? state.backendWorkspaces[activeBackendId]
        : undefined;
    // A worker restart discards its workspace and with it this request token.
    if (workspace?.closingSessionIds.get(id) !== request) return true;
    if (stopped) {
      const version = sessionListVersions.get(activeBackendId) ?? 0;
      sessionListVersions.set(activeBackendId, version + 1);
    }
    const update = settleClose(workspace, id, stopped);
    if (current) {
      set(update);
      if (stopped) void get().loadSessions();
    } else if (activeBackendId) {
      set({
        backendWorkspaces: {
          ...state.backendWorkspaces,
          [activeBackendId]: { ...workspace, ...update },
        },
      });
    }
    return stopped;
  },

  deleteSession: async (id: string) => {
    try {
      const { apiBase, isCurrent } = activeBackendRequestContext();
      const res = await daroxFetch(`${apiBase}/api/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete session");
      if (!isCurrent()) return false;
      await get().loadSessions();
      return true;
    } catch (e) {
      console.error("Failed to delete session", e);
      return false;
    }
  },

  loadSessions: async () => {
    try {
      const { apiBase, isCurrent } = sessionListRequestContext();
      const res = await daroxFetch(`${apiBase}/api/sessions`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const sessions: SessionInfo[] = await res.json();
      if (!isCurrent()) return;
      set({ sessions });
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  },

  loadAgents: async () => {
    try {
      const { apiBase, isCurrent } = sessionListRequestContext();
      const res = await daroxFetch(`${apiBase}/api/sessions`);
      if (!res.ok) throw new Error("Failed to load active sessions");
      const sessions: SessionInfo[] = await res.json();
      if (!isCurrent()) return;
      const agents = sessions
        .filter((session) => session.active)
        .map(sessionToAgentTab);
      set((state) => {
        const visible = agents.filter(
          (tab) => !state.closingSessionIds.has(tab.id),
        );
        const pending = state.tabs.filter((tab) =>
          state.closingSessionIds.has(tab.id),
        );
        // Preserve the selected tab if it's still visible, otherwise select first.
        const activeId = visible.some((tab) => tab.id === state.activeId)
          ? state.activeId
          : (visible[0]?.id ?? null);
        return { sessions, tabs: [...visible, ...pending], activeId };
      });
    } catch (e) {
      console.error("Failed to load agents", e);
    }
  },

  openSession: async (sessionId: string) => {
    if (get().closingSessionIds.has(sessionId)) return null;
    try {
      const { apiBase, isCurrent } = activeBackendRequestContext();
      const res = await daroxFetch(
        `${apiBase}/api/sessions/${sessionId}/start`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error("Failed to open session");
      const tab = sessionToAgentTab(await res.json());
      if (!isCurrent() || get().closingSessionIds.has(sessionId)) return null;
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeId: tab.id,
      }));
      return tab;
    } catch (e) {
      console.error("Failed to open session", e);
      return null;
    }
  },

  updateAgent: (agent) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === agent.id ? agent : t)),
    })),

  clearAgents: () =>
    set({
      tabs: [],
      closingSessionIds: new Map(),
      activeId: null,
      completionUnread: {},
      isBusy: {},
      notificationSelection: null,
    }),
}));

useBackendStore.subscribe((state, prevState) => {
  if (state.activeBackendId === prevState.activeBackendId) {
    if (state.connectionRevision !== prevState.connectionRevision) {
      useAgentTabs.setState((agentState) => {
        const backendWorkspaces = { ...agentState.backendWorkspaces };
        if (state.activeBackendId)
          delete backendWorkspaces[state.activeBackendId];
        return {
          backendWorkspaces,
          tabs: [],
          activeId: null,
          sessions: [],
          closingSessionIds: new Map(),
          completionUnread: {},
          isBusy: {},
          loading: false,
          notificationSelection: null,
        };
      });
    }
    return;
  }

  useAgentTabs.setState((agentState) => {
    const backendWorkspaces = { ...agentState.backendWorkspaces };
    if (prevState.activeBackendId) {
      backendWorkspaces[prevState.activeBackendId] = {
        tabs: agentState.tabs,
        activeId: agentState.activeId,
        sessions: agentState.sessions,
        closingSessionIds: agentState.closingSessionIds,
        completionUnread: agentState.completionUnread,
        isBusy: agentState.isBusy,
      };
    }
    if (
      state.activeBackendId &&
      state.connectionRevision !== prevState.connectionRevision
    )
      delete backendWorkspaces[state.activeBackendId];
    const next = state.activeBackendId
      ? backendWorkspaces[state.activeBackendId]
      : undefined;
    return {
      backendWorkspaces,
      tabs: next?.tabs || [],
      activeId: next?.activeId || null,
      sessions: next?.sessions || [],
      closingSessionIds: next?.closingSessionIds ?? new Map(),
      completionUnread: next?.completionUnread || {},
      isBusy: next?.isBusy || {},
      loading: false,
      notificationSelection: null,
    };
  });
});
