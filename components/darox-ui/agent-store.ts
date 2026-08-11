"use client";
import { daroxFetch } from "@/lib/api";

import { create } from "zustand";
import { useBackendStore } from "@/components/darox-ui/backend-store";

export type AgentTab = {
  id: string;
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
    name: session.agent_name,
    status: session.active ? "active" : "closed",
    workspace: session.workspace || "",
    subagents: session.children.map(sessionToAgentTab),
  };
}

type AgentWorkspace = {
  tabs: AgentTab[];
  activeId: string | null;
  sessions: SessionInfo[];
  needsInput: Record<string, Record<string, boolean>>;
  isStreaming: Record<string, Record<string, boolean>>;
};

type AgentTabsState = {
  tabs: AgentTab[];
  activeId: string | null;
  loading: boolean;
  sessions: SessionInfo[];
  needsInput: Record<string, Record<string, boolean>>; // sessionId -> agentName -> boolean
  isStreaming: Record<string, Record<string, boolean>>; // sessionId -> agentName -> boolean
  backendWorkspaces: Record<string, AgentWorkspace>;

  setActiveId: (id: string) => void;
  setNeedsInput: (sessionId: string, agentName: string, needs: boolean) => void;
  clearNeedsInput: (sessionId: string) => void;
  setStreaming: (
    sessionId: string,
    agentName: string,
    streaming: boolean,
  ) => void;

  createAgent: (workspace: string) => Promise<AgentTab | null>;
  deleteAgent: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<boolean>;
  loadSessions: () => Promise<void>;
  loadAgents: () => Promise<void>;
  openSession: (sessionId: string) => Promise<AgentTab | null>;
  updateAgent: (agent: AgentTab) => void;
  clearAgents: () => void;
};

export const useAgentTabs = create<AgentTabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  loading: false,
  sessions: [],
  needsInput: {},
  isStreaming: {},
  backendWorkspaces: {},

  setActiveId: (id) =>
    set((state) => {
      const newNeedsInput = { ...state.needsInput };
      delete newNeedsInput[id];
      return { activeId: id, needsInput: newNeedsInput };
    }),

  setNeedsInput: (sessionId, agentName, needs) =>
    set((state) => {
      const sessionNeeds = state.needsInput[sessionId] || {};
      if (sessionNeeds[agentName] === needs) return state;
      return {
        needsInput: {
          ...state.needsInput,
          [sessionId]: {
            ...sessionNeeds,
            [agentName]: needs,
          },
        },
      };
    }),

  clearNeedsInput: (sessionId) =>
    set((state) => {
      if (!state.needsInput[sessionId]) return state;
      const newNeedsInput = { ...state.needsInput };
      delete newNeedsInput[sessionId];
      return { needsInput: newNeedsInput };
    }),

  setStreaming: (sessionId, agentName, streaming) =>
    set((state) => {
      const sessionStreaming = state.isStreaming[sessionId] || {};
      if (sessionStreaming[agentName] === streaming) return state;
      return {
        isStreaming: {
          ...state.isStreaming,
          [sessionId]: {
            ...sessionStreaming,
            [agentName]: streaming,
          },
        },
      };
    }),

  createAgent: async (workspace: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(`${apiBase}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      const tab = sessionToAgentTab(await res.json());
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
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(`${apiBase}/api/sessions/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to stop session");
    } catch (e) {
      console.error("Failed to delete agent", e);
    }
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== id);
      const newNeedsInput = { ...state.needsInput };
      delete newNeedsInput[id];
      const newIsStreaming = { ...state.isStreaming };
      delete newIsStreaming[id];

      let activeId = state.activeId;
      if (activeId === id) {
        activeId = tabs.length > 0 ? tabs[0].id : null;
      }
      return {
        tabs,
        activeId,
        needsInput: newNeedsInput,
        isStreaming: newIsStreaming,
      };
    });

    // Refresh session list after a session is closed or refreshed
    get().loadSessions();
  },

  deleteSession: async (id: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(`${apiBase}/api/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete session");
      await get().loadSessions();
      return true;
    } catch (e) {
      console.error("Failed to delete session", e);
      return false;
    }
  },

  loadSessions: async () => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(`${apiBase}/api/sessions`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const sessions: SessionInfo[] = await res.json();
      set({ sessions });
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  },

  loadAgents: async () => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(`${apiBase}/api/sessions`);
      if (!res.ok) throw new Error("Failed to load active sessions");
      const sessions: SessionInfo[] = await res.json();
      const agents = sessions
        .filter((session) => session.active)
        .map(sessionToAgentTab);
      set((state) => {
        // preserve activeId if it's still in the list, otherwise select first
        let newActiveId = state.activeId;
        if (agents.length > 0) {
          if (!newActiveId || !agents.some((a) => a.id === newActiveId)) {
            newActiveId = agents[0].id;
          }
        } else {
          newActiveId = null;
        }
        return { tabs: agents, activeId: newActiveId };
      });
    } catch (e) {
      console.error("Failed to load agents", e);
    }
  },

  openSession: async (sessionId: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(
        `${apiBase}/api/sessions/${sessionId}/start`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error("Failed to open session");
      const tab = sessionToAgentTab(await res.json());
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
    set({ tabs: [], activeId: null, needsInput: {}, isStreaming: {} }),
}));

useBackendStore.subscribe((state, prevState) => {
  if (state.activeBackendId === prevState.activeBackendId) return;

  useAgentTabs.setState((agentState) => {
    const backendWorkspaces = { ...agentState.backendWorkspaces };
    if (prevState.activeBackendId) {
      backendWorkspaces[prevState.activeBackendId] = {
        tabs: agentState.tabs,
        activeId: agentState.activeId,
        sessions: agentState.sessions,
        needsInput: agentState.needsInput,
        isStreaming: agentState.isStreaming,
      };
    }
    const next = state.activeBackendId
      ? backendWorkspaces[state.activeBackendId]
      : undefined;
    return {
      backendWorkspaces,
      tabs: next?.tabs || [],
      activeId: next?.activeId || null,
      sessions: next?.sessions || [],
      needsInput: next?.needsInput || {},
      isStreaming: next?.isStreaming || {},
      loading: false,
    };
  });
});
