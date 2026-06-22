"use client";
import { daroxFetch } from "@/lib/api";

import { create } from "zustand";
import { useBackendStore } from "@/components/darox-ui/backend-store";

export type AgentTab = {
  id: string;
  workspace: string;
  main_agent: string;
  subagents: string[];
};

export type SessionInfo = {
  id: string;
  main_agent: string;
  workspace: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

type AgentTabsState = {
  tabs: AgentTab[];
  activeId: string | null;
  loading: boolean;
  sessions: SessionInfo[];
  needsInput: Record<string, Record<string, boolean>>; // sessionId -> agentName -> boolean
  isStreaming: Record<string, Record<string, boolean>>; // sessionId -> agentName -> boolean

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
  openSession: (
    sessionId: string,
    workspace?: string,
  ) => Promise<AgentTab | null>;
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
      const res = await daroxFetch(`${apiBase}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      const tab: AgentTab = await res.json();
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
      await daroxFetch(`${apiBase}/api/agents/${id}`, { method: "DELETE" });
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
      const res = await daroxFetch(`${apiBase}/api/agents`);
      if (!res.ok) throw new Error("Failed to load agents");
      const agents: AgentTab[] = await res.json();
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

  openSession: async (sessionId: string, workspace?: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await daroxFetch(`${apiBase}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspace || undefined,
          session_id: sessionId,
        }),
      });
      if (!res.ok) throw new Error("Failed to open session");
      const tab: AgentTab = await res.json();
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
  if (
    state.processStatus === "starting" &&
    prevState.processStatus !== "starting"
  ) {
    useAgentTabs.getState().clearAgents();
  }
});
