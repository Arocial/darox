'use client';

import { create } from 'zustand';
import { useBackendStore } from '@/components/darox-ui/backend-store';

export type ComposerTab = {
  id: string;
  workspace: string;
};

export type SessionInfo = {
  id: string;
  composer_name: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
};

type ComposerTabsState = {
  tabs: ComposerTab[];
  activeId: string | null;
  loading: boolean;
  sessions: SessionInfo[];

  setActiveId: (id: string) => void;
  loadComposers: () => Promise<void>;
  createComposer: (workspace: string) => Promise<ComposerTab | null>;
  deleteComposer: (id: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  openSession: (session: SessionInfo) => Promise<ComposerTab | null>;
};

export const useComposerTabs = create<ComposerTabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  loading: false,
  sessions: [],

  setActiveId: (id) => set({ activeId: id }),

  loadComposers: async () => {
    set({ loading: true });
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/composers`);
      if (!res.ok) throw new Error('Failed to load composers');
      const tabs: ComposerTab[] = await res.json();
      set({
        tabs,
        activeId: tabs.length > 0 ? tabs[0].id : null,
      });
    } catch (e) {
      console.error('Failed to load composers', e);
    } finally {
      set({ loading: false });
    }
  },

  createComposer: async (workspace: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/composers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace }),
      });
      if (!res.ok) throw new Error('Failed to create composer');
      const tab: ComposerTab = await res.json();
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeId: tab.id,
      }));
      return tab;
    } catch (e) {
      console.error('Failed to create composer', e);
      return null;
    }
  },

  deleteComposer: async (id: string) => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      await fetch(`${apiBase}/api/composers/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete composer', e);
    }
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== id);
      let activeId = state.activeId;
      if (activeId === id) {
        activeId = tabs.length > 0 ? tabs[0].id : null;
      }
      return { tabs, activeId };
    });
    
    // Refresh session list after a session is closed or refreshed
    get().loadSessions();
  },

  loadSessions: async () => {
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/sessions`);
      if (!res.ok) throw new Error('Failed to load sessions');
      const sessions: SessionInfo[] = await res.json();
      set({ sessions });
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  },

  openSession: async (session: SessionInfo) => {
    const workspace = session.metadata?.workspace;
    try {
      const apiBase = useBackendStore.getState().apiBase;
      const res = await fetch(`${apiBase}/api/composers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: workspace || undefined, session_id: session.id }),
      });
      if (!res.ok) throw new Error('Failed to open session');
      const tab: ComposerTab = await res.json();
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeId: tab.id,
      }));
      return tab;
    } catch (e) {
      console.error('Failed to open session', e);
      return null;
    }
  },
}));
