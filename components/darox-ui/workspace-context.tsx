'use client';

import { createContext, useContext } from 'react';

export const WorkspaceContext = createContext<string | null>(null);

export function useWorkspace(): string {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error('useWorkspace must be used within a WorkspaceContext.Provider');
  }
  return workspace;
}

export function historyKey(workspace: string): string {
  return `cmd_history:${workspace}`;
}
