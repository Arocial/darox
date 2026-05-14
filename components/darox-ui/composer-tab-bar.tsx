"use client";

import { type FC, useEffect, useState, useMemo } from "react";
import {
  PlusIcon,
  XIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  FolderIcon,
  SquarePenIcon,
  RotateCwIcon,
} from "lucide-react";
import {
  useComposerTabs,
  type SessionInfo,
} from "@/components/darox-ui/composer-store";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import { toast } from "sonner";

async function pickDirectory(): Promise<string | null> {
  const api = typeof window !== "undefined" ? window.darox : undefined;
  if (api) {
    try {
      const result = await api.openDialog({
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    } catch (e) {
      console.error("openDialog failed", e);
      return null;
    }
  }
  const dir = prompt("Enter workspace directory path:");
  return dir || null;
}

function formatTabLabel(workspace: string) {
  const parts = workspace.replace(/\/+$/, "").split("/");
  const dirName = parts[parts.length - 1] || workspace;
  const parentPath = parts.length > 1 ? parts.slice(-2).join("/") : dirName;
  return { dirName, parentPath };
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
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
    deleteSession,
    sessions,
    loadSessions,
    openSession,
  } = useComposerTabs();
  const [showSessions, setShowSessions] = useState(true);
  const [showWorkspaces, setShowWorkspaces] = useState(true);
  const backendStatus = useBackendStore((s) => s.status);
  const restartBackend = useBackendStore((s) => s.restartBackend);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (backendStatus === "connected") {
      loadSessions();
    }
  }, [backendStatus, loadSessions]);

  const handleAdd = async () => {
    const workspace = await pickDirectory();
    if (!workspace) return;
    await createComposer(workspace);
  };

  const handleClose = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteComposer(id);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const success = await deleteSession(id);
    if (success) {
      toast.success("Session deleted successfully");
    } else {
      toast.error("Failed to delete session");
    }
  };

  const handleReset = async (
    e: React.MouseEvent,
    id: string,
    workspace: string,
  ) => {
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
      if (typeof ws === "string" && !seen.has(ws)) {
        seen.add(ws);
        workspaces.push({ workspace: ws, updated_at: session.updated_at });
      }
    }
    return workspaces;
  }, [sessions]);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/30">
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {tabs.length > 0 && (
          <div className="mb-4">
            <div className="px-3 py-1.5 font-bold text-primary text-xs uppercase tracking-wider">
              Active
            </div>
            {tabs.map((tab) => {
              const { dirName, parentPath } = formatTabLabel(tab.workspace);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  className={`group relative flex w-full items-start gap-2 border-r-2 px-3 py-2 text-left transition-colors ${
                    activeId === tab.id
                      ? "border-primary bg-accent text-foreground shadow-sm"
                      : "border-transparent text-foreground/80 hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <MessageSquareIcon
                    className={`mt-0.5 size-4 shrink-0 ${activeId === tab.id ? "text-primary" : "opacity-70"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-sm ${activeId === tab.id ? "font-bold" : "font-medium"}`}
                      title={tab.workspace}
                    >
                      {dirName}
                    </div>
                    <div
                      className={`truncate text-xs ${activeId === tab.id ? "text-muted-foreground/80" : "text-muted-foreground"}`}
                      title={`${tab.workspace} ${tab.id}`}
                    >
                      {parentPath}
                    </div>
                  </div>
                  <div className="mt-0.5 flex shrink-0 items-center gap-1">
                    <span
                      onClick={(e) => handleReset(e, tab.id, tab.workspace)}
                      className={`cursor-pointer rounded-sm p-0.5 transition-opacity hover:bg-foreground/20 hover:text-foreground ${
                        activeId === tab.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                      title="New chat in workspace"
                    >
                      <SquarePenIcon className="size-3.5" />
                    </span>
                    <span
                      onClick={(e) => handleClose(e, tab.id)}
                      className={`cursor-pointer rounded-sm p-0.5 transition-opacity hover:bg-destructive/20 hover:text-destructive ${
                        activeId === tab.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
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
          <div className="group flex items-center justify-between px-3 py-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider transition-colors hover:text-foreground">
            <button
              onClick={() => setShowWorkspaces(!showWorkspaces)}
              className="flex flex-1 items-center justify-between text-left"
            >
              <span>Workspaces</span>
              {showWorkspaces ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadSessions();
              }}
              className="ml-2 rounded p-0.5 transition-all hover:bg-muted/50"
              title="Refresh Workspaces"
            >
              <RotateCwIcon className="size-3" />
            </button>
          </div>

          {showWorkspaces && (
            <div className="mt-1">
              <button
                onClick={handleAdd}
                className="flex w-full items-center gap-2 border-transparent border-r-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <PlusIcon className="size-4 shrink-0 opacity-70" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">New (Choose Workspace)</div>
                </div>
              </button>
              {recentWorkspaces.map(({ workspace }) => {
                const { dirName, parentPath } = formatTabLabel(workspace);
                return (
                  <button
                    key={workspace}
                    onClick={() => handleNewInWorkspace(workspace)}
                    className="flex w-full items-start gap-2 border-transparent border-r-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <FolderIcon className="mt-0.5 size-4 shrink-0 opacity-70" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm" title={workspace}>
                        {dirName}
                      </div>
                      <div
                        className="truncate text-muted-foreground text-xs"
                        title={parentPath}
                      >
                        {parentPath}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="group flex items-center justify-between px-3 py-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider transition-colors hover:text-foreground">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="flex flex-1 items-center justify-between text-left"
            >
              <span>Recent Sessions</span>
              {showSessions ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadSessions();
              }}
              className="ml-2 rounded p-0.5 transition-all hover:bg-muted/50"
              title="Refresh Sessions"
            >
              <RotateCwIcon className="size-3" />
            </button>
          </div>

          {showSessions && (
            <div className="mt-1">
              {availableSessions.length === 0 ? (
                <div className="px-3 py-2 text-muted-foreground text-xs">
                  No recent sessions
                </div>
              ) : (
                availableSessions.map((session) => {
                  const workspace =
                    (session.metadata?.workspace as string) || "";
                  const { dirName } = formatTabLabel(workspace);
                  const lastMessages = session.metadata?.last_user_messages as
                    | string[]
                    | undefined;
                  const tooltipText =
                    lastMessages && lastMessages.length > 0
                      ? lastMessages.join("\n")
                      : workspace;

                  return (
                    <button
                      key={session.id}
                      onClick={() => handleOpenSession(session)}
                      className="group flex w-full items-start gap-2 border-transparent border-r-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      title={tooltipText}
                    >
                      <MessageSquareIcon className="mt-0.5 size-4 shrink-0 opacity-70" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {dirName || session.id.slice(0, 8)}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground text-xs">
                          <span className="flex-1 truncate">
                            {lastMessages && lastMessages.length > 0
                              ? lastMessages[0]
                              : "Empty session"}
                          </span>
                          <span className="shrink-0 text-[10px] opacity-70">
                            {formatRelativeTime(session.updated_at)}
                          </span>
                        </div>
                      </div>
                      <span
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="cursor-pointer rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                        title="Delete session"
                      >
                        <TrashIcon className="size-3.5" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span
            className={`inline-block size-2 rounded-full ${
              backendStatus === "connected"
                ? "bg-green-500"
                : backendStatus === "connecting"
                  ? "animate-pulse bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <span>
            {backendStatus === "connected"
              ? "Connected"
              : backendStatus === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </span>
        </div>
        <button
          onClick={async () => {
            setRestarting(true);
            await restartBackend();
            setRestarting(false);
          }}
          disabled={restarting}
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
          title="Restart Backend"
        >
          <RotateCwIcon
            className={`size-4 ${restarting ? "animate-spin" : ""}`}
          />
        </button>
      </div>
    </div>
  );
};
