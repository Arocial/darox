'use client';

import { useEffect } from 'react';
import { useComposerTabs } from '@/components/darox-ui/composer-store';
import { ComposerTabBar } from '@/components/darox-ui/composer-tab-bar';
import { ComposerTabPanel } from '@/components/darox-ui/composer-tab-panel';
import { useBackendStore } from '@/components/darox-ui/backend-store';

export type ChatInputEventArgs = {
  deferred_tools: Record<string, string>; // id: question
  normal_input: { request: boolean; user_input: string | null };
  exception_input: { exception: string | null; retry: boolean };
};

export type ChatInputEventResult = {
  deferred_tools: Record<string, string>; // id: answer
  exception_input: { retry: boolean };
  normal_input: { user_input: string | null };
};

export default function Chat() {
  const { tabs, activeId, loading, loadComposers, loadSessions } =
    useComposerTabs();
  const backendStatus = useBackendStore((s) => s.status);
  const processStatus = useBackendStore((s) => s.processStatus);

  useEffect(() => {
    const backend = useBackendStore.getState();
    let unlisten: (() => void) | void;
    backend.setupTauriListeners().then((fn) => {
      unlisten = fn;
    });
    backend.startHealthCheck();
    return () => {
      backend.stopHealthCheck();
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (backendStatus === 'connected') {
      loadComposers();
      loadSessions();
    }
  }, [backendStatus, loadComposers, loadSessions]);

  if (processStatus === 'starting' && backendStatus !== 'connected') {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-muted-foreground border-t-transparent" />
          <span>Starting backend...</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Loading composers...
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-row">
      <ComposerTabBar />
      <div className="flex-1 min-h-0 relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${
              activeId === tab.id ? 'z-10 visible' : 'z-0 invisible'
            }`}
          >
            <ComposerTabPanel composerId={tab.id} workspace={tab.workspace} />
          </div>
        ))}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No composers open. Click &quot;New Composer&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
