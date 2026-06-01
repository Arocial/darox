"use client";

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

  setActiveId: (id: string) => void;
  setNeedsInput: (sessionId: string, agentName: string, needs: boolean) => void;
  clearNeedsInput: (sessionId: string) => void;
  loadAgents: () => Promise<void>;
  createAgent: (workspace: string) => Promise<AgentTab | null>;
  deleteAgent: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<boolean>;
  loadSessions: () => Promise<void>;
  openSession: (session: SessionInfo) => Promise<AgentTab | null>;
  openSessionById: (
    sessionId: string,
    workspace?: string,
  ) => Promise<AgentTab | null>;
  clearAgents: () => void;
};

export const useAgentTabs = create<AgentTabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  loading: false,
  sessions: [],
  needsInput: {},

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

  loadAgents: async () => {
    set({ loading: true });
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/agents`);
      if (!res.ok) throw new Error("Failed to load agents");
      const tabs: AgentTab[] = await res.json();
      set({
        tabs,
        activeId: tabs.length > 0 ? tabs[0].id : null,
      });
    } catch (e) {
      console.error("Failed to load agents", e);
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (workspace: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/agents`, {
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
      await fetch(`${apiBase}/api/agents/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete agent", e);
    }
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== id);
      const newNeedsInput = { ...state.needsInput };
      delete newNeedsInput[id];

      let activeId = state.activeId;
      if (activeId === id) {
        activeId = tabs.length > 0 ? tabs[0].id : null;
      }
      return { tabs, activeId, needsInput: newNeedsInput };
    });

    // Refresh session list after a session is closed or refreshed
    get().loadSessions();
  },

  deleteSession: async (id: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/sessions/${id}`, {
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
      const res = await fetch(`${apiBase}/api/sessions`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const sessions: SessionInfo[] = await res.json();
      set({ sessions });
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  },

  openSession: async (session: SessionInfo) => {
    const workspace = session.workspace;
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspace || undefined,
          session_id: session.id,
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

  openSessionById: async (sessionId: string, workspace?: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/agents`, {
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

  clearAgents: () => set({ tabs: [], activeId: null, needsInput: {} }),
}));

useBackendStore.subscribe((state, prevState) => {
  if (
    state.processStatus === "starting" &&
    prevState.processStatus !== "starting"
  ) {
    useAgentTabs.getState().clearAgents();
  }
});
