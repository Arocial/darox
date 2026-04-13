'use client';

import { FC, useEffect, useState, useMemo } from 'react';
import {
  PlusIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  FolderIcon,
  SquarePenIcon,
} from 'lucide-react';
import {
  useComposerTabs,
  type SessionInfo,
} from '@/components/darox-ui/composer-store';

async function pickDirectory(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    return selected as string | null;
  } catch {
    // Fallback for browser (non-Tauri) environment
    const dir = prompt('Enter workspace directory path:');
    return dir || null;
  }
}

function formatTabLabel(workspace: string) {
  const parts = workspace.replace(/\/+$/, '').split('/');
  const dirName = parts[parts.length - 1] || workspace;
  const parentPath = parts.length > 1 ? parts.slice(-2).join('/') : dirName;
  return { dirName, parentPath };
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const ComposerTabBar: FC = () => {
  const {
    tabs,
    activeId,
    setActiveId,
    createComposer,
    deleteComposer,
    sessions,
    loadSessions,
    openSession,
  } = useComposerTabs();
  const [showSessions, setShowSessions] = useState(true);
  const [showWorkspaces, setShowWorkspaces] = useState(true);

  useEffect(() => {
    if (showSessions || showWorkspaces) {
      loadSessions();
    }
  }, [showSessions, showWorkspaces, loadSessions]);

  const handleAdd = async () => {
    const workspace = await pickDirectory();
    if (!workspace) return;
    await createComposer(workspace);
  };

  const handleClose = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteComposer(id);
  };

  const handleReset = async (e: React.MouseEvent, id: string, workspace: string) => {
    e.stopPropagation();
    const newTab = await createComposer(workspace);
    if (newTab) {
      await deleteComposer(id);
    }
  };

  const handleNewInWorkspace = async (workspace: string) => {
    await createComposer(workspace);
  };

  const handleOpenSession = async (session: SessionInfo) => {
    await openSession(session);
  };

  // Filter out sessions that are already open as tabs
  const openSessionIds = new Set(tabs.map((t) => t.id));
  const availableSessions = sessions.filter((s) => !openSessionIds.has(s.id));

  // Extract unique workspaces from sessions
  const recentWorkspaces = useMemo(() => {
    const seen = new Set<string>();
    const workspaces: { workspace: string; updated_at: string }[] = [];
    for (const session of sessions) {
      const ws = session.metadata?.workspace;
      if (ws && !seen.has(ws)) {
        seen.add(ws);
        workspaces.push({ workspace: ws, updated_at: session.updated_at });
      }
    }
    return workspaces;
  }, [sessions]);

  return (
    <div className="flex flex-col border-r bg-muted/30 w-64 shrink-0 h-full">
      <div className="flex-1 overflow-y-auto py-2">
        {tabs.length > 0 && (
          <div className="mb-4">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active
            </div>
            {tabs.map((tab) => {
              const { dirName, parentPath } = formatTabLabel(tab.workspace);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  className={`group relative flex items-start gap-2 w-full px-3 py-2 text-left border-r-2 transition-colors ${
                    activeId === tab.id
                      ? 'border-primary text-accent-foreground bg-accent'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={tab.workspace}>
                      {dirName}
                    </div>
                    <div
                      className="text-xs text-muted-foreground truncate"
                      title={`${tab.workspace} ${tab.id}`}
                    >
                      {parentPath}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 shrink-0">
                    <span
                      onClick={(e) => handleReset(e, tab.id, tab.workspace)}
                      className={`rounded-sm p-0.5 hover:bg-foreground/20 hover:text-foreground transition-opacity cursor-pointer ${
                        activeId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="New chat in workspace"
                    >
                      <SquarePenIcon className="size-3.5" />
                    </span>
                    <span
                      onClick={(e) => handleClose(e, tab.id)}
                      className={`rounded-sm p-0.5 hover:bg-destructive/20 hover:text-destructive transition-opacity cursor-pointer ${
                        activeId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="Close tab"
                    >
                      <XIcon className="size-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={() => setShowWorkspaces(!showWorkspaces)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <span>Workspaces</span>
            {showWorkspaces ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </button>

          {showWorkspaces && (
            <div className="mt-1">
              <button
                onClick={handleAdd}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-r-2 border-transparent"
              >
                <PlusIcon className="size-4 shrink-0 opacity-70" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    New (Choose Workspace)
                  </div>
                </div>
              </button>
              {recentWorkspaces.map(({ workspace }) => {
                  const { dirName, parentPath } = formatTabLabel(workspace);
                  return (
                    <button
                      key={workspace}
                      onClick={() => handleNewInWorkspace(workspace)}
                      className="flex items-start gap-2 w-full px-3 py-2 text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-r-2 border-transparent"
                    >
                      <FolderIcon className="size-4 mt-0.5 shrink-0 opacity-70" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" title={workspace}>
                          {dirName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={parentPath}>
                          {parentPath}
                        </div>
                      </div>
                    </button>
                  );
                })
              }
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <span>Recent Sessions</span>
            {showSessions ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </button>

          {showSessions && (
            <div className="mt-1">
              {availableSessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No recent sessions
                </div>
              ) : (
                availableSessions.map((session) => {
                  const workspace = session.metadata?.workspace || '';
                  const { dirName } = formatTabLabel(workspace);
                  return (
                    <button
                      key={session.id}
                      onClick={() => handleOpenSession(session)}
                      className="flex items-start gap-2 w-full px-3 py-2 text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-r-2 border-transparent"
                    >
                      <MessageSquareIcon className="size-4 mt-0.5 shrink-0 opacity-70" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" title={workspace}>
                          {dirName || session.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatRelativeTime(session.updated_at)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
