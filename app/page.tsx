'use client';

import { useEffect } from 'react';
import { useComposerTabs } from '@/components/darox-ui/composer-store';
import { ComposerTabBar } from '@/components/darox-ui/composer-tab-bar';
import { ComposerTabPanel } from '@/components/darox-ui/composer-tab-panel';

export type ChatInputEventArgs = {
  deferred_tools: Record<string, string>; // id: question
  normal_input: { request: boolean; user_input: string | null };
  exception_input: { exception: string | null; to_continue: boolean };
};

export type ChatInputEventResult = {
  deferred_tools: Record<string, string>; // id: answer
  exception_input: { to_continue: boolean };
  normal_input: { user_input: string | null };
};

export default function Chat() {
  const { tabs, activeId, loading, loadComposers } = useComposerTabs();

  useEffect(() => {
    loadComposers();
  }, [loadComposers]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Loading composers...
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
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
            No composers open. Click + to create one.
          </div>
        )}
      </div>
    </div>
  );
}
