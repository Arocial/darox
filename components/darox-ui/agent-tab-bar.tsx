"use client";

import {
  FolderIcon,
  MessageSquareIcon,
  PlusIcon,
  RotateCwIcon,
  SquarePenIcon,
  XIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAgentTabs } from "@/components/darox-ui/agent-store";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import type { AgentTab, SessionInfo } from "@/components/darox-ui/agent-store";

function formatRelativeTime(dateString?: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

function formatTabLabel(workspaceStr?: string) {
  const ws = workspaceStr || "";
  const separator = ws.includes("\\") ? "\\" : "/";
  const parts = ws.split(separator).filter(Boolean);
  if (parts.length === 0) return { dirName: "Untitled", parentPath: "" };

  const dirName = parts[parts.length - 1];
  const parentPath =
    parts.length > 1 ? parts.slice(0, parts.length - 1).join(separator) : "";

  return { dirName, parentPath };
}

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

const ActiveTabItem = ({
  tab,
  activeId,
  needsInput,
  onSelect,
  onReset,
  onClose,
}: {
  tab: AgentTab;
  activeId: string | null;
  needsInput: Record<string, boolean>;
  onSelect: (id: string) => void;
  onReset: (e: React.MouseEvent, id: string, workspace: string) => void;
  onClose: (e: React.MouseEvent, id: string) => void;
}) => {
  const { dirName, parentPath } = formatTabLabel(tab.workspace);
  const hasInputRequest = Object.values(needsInput || {}).some((v) => v);
  const isActive = activeId === tab.id;

  return (
    <button
      onClick={() => onSelect(tab.id)}
      className={`group relative flex w-full items-start gap-2 border-r-2 px-3 py-2 text-left transition-colors ${
        isActive
          ? "border-primary bg-accent text-foreground shadow-sm"
          : "border-transparent text-foreground/80 hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <MessageSquareIcon
        className={`mt-0.5 size-4 shrink-0 ${isActive ? "text-primary" : "opacity-70"}`}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 truncate text-sm ${isActive ? "font-bold" : "font-medium"}`}
          title={tab.workspace}
        >
          <span className="truncate">{dirName}</span>
          {hasInputRequest && (
            <span
              className="size-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
              title="Input required"
            />
          )}
        </div>
        <div
          className={`truncate text-xs ${isActive ? "text-muted-foreground/80" : "text-muted-foreground"}`}
          title={`${tab.workspace} ${tab.id}`}
        >
          {parentPath}
        </div>
      </div>
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <span
          onClick={(e) => onReset(e, tab.id, tab.workspace)}
          className={`cursor-pointer rounded-sm p-0.5 transition-opacity hover:bg-foreground/20 hover:text-foreground ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          title="New chat in workspace"
        >
          <SquarePenIcon className="size-3.5" />
        </span>
        <span
          onClick={(e) => onClose(e, tab.id)}
          className={`cursor-pointer rounded-sm p-0.5 transition-opacity hover:bg-destructive/20 hover:text-destructive ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          title="Close tab"
        >
          <XIcon className="size-3.5" />
        </span>
      </div>
    </button>
  );
};

const WorkspaceItem = ({
  workspace,
  onSelect,
}: {
  workspace: string;
  onSelect: (ws: string) => void;
}) => {
  const { dirName, parentPath } = formatTabLabel(workspace);
  return (
    <button
      onClick={() => onSelect(workspace)}
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
};

const SessionItem = ({
  session,
  onSelect,
  onDelete,
}: {
  session: SessionInfo;
  onSelect: (session: SessionInfo) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) => {
  const workspace = session.workspace;
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
      onClick={() => onSelect(session)}
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
        onClick={(e) => onDelete(e, session.id)}
        className="cursor-pointer rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
        title="Delete session"
      >
        <TrashIcon className="size-3.5" />
      </span>
    </button>
  );
};

export const AgentTabBar = () => {
  const {
    tabs,
    activeId,
    setActiveId,
    createAgent,
    deleteAgent,
    needsInput,
    sessions,
    loadSessions,
    deleteSession,
    openSession,
  } = useAgentTabs();

  const [showWorkspaces, setShowWorkspaces] = useState(true);
  const [showSessions, setShowSessions] = useState(true);

  const backendStatus = useBackendStore((s) => s.status);
  const restartBackend = useBackendStore((s) => s.restartBackend);
  const switchBackend = useBackendStore((s) => s.switchBackend);
  const closeBackend = useBackendStore((s) => s.closeBackend);
  const activeProfile = useBackendStore((s) => s.activeProfile);
  const profiles = useBackendStore((s) => s.profiles);
  const instances = useBackendStore((s) => s.instances);

  const [restarting, setRestarting] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    if (backendStatus === "connected") {
      loadSessions();
    }
  }, [backendStatus, loadSessions]);

  const handleAdd = useCallback(async () => {
    const workspace = await pickDirectory();
    if (!workspace) return;
    await createAgent(workspace);
  }, [createAgent]);

  const handleClose = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteAgent(id);
    },
    [deleteAgent],
  );

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const success = await deleteSession(id);
      if (success) {
        toast.success("Session deleted successfully");
      } else {
        toast.error("Failed to delete session");
      }
    },
    [deleteSession],
  );

  const handleReset = useCallback(
    async (e: React.MouseEvent, id: string, workspace: string) => {
      e.stopPropagation();
      const newTab = await createAgent(workspace);
      if (newTab) {
        await deleteAgent(id);
      }
    },
    [createAgent, deleteAgent],
  );

  const handleNewInWorkspace = useCallback(
    async (workspace: string) => {
      await createAgent(workspace);
    },
    [createAgent],
  );

  const handleOpenSession = useCallback(
    async (session: SessionInfo) => {
      await openSession(session.id, session.workspace);
    },
    [openSession],
  );

  // Filter out sessions that are already open as tabs
  const openSessionIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
  const availableSessions = useMemo(
    () => sessions.filter((s) => !openSessionIds.has(s.id)),
    [sessions, openSessionIds],
  );

  // Extract unique workspaces from sessions
  const recentWorkspaces = useMemo(() => {
    const seen = new Set<string>();
    const workspaces: { workspace: string; updated_at: string }[] = [];
    for (const session of sessions) {
      const ws = session.workspace;
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
            {tabs.map((tab) => (
              <ActiveTabItem
                key={tab.id}
                tab={tab}
                activeId={activeId}
                needsInput={needsInput[tab.id]}
                onSelect={setActiveId}
                onReset={handleReset}
                onClose={handleClose}
              />
            ))}
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
              {recentWorkspaces.map(({ workspace }) => (
                <WorkspaceItem
                  key={workspace}
                  workspace={workspace}
                  onSelect={handleNewInWorkspace}
                />
              ))}
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
                availableSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    onSelect={handleOpenSession}
                    onDelete={handleDeleteSession}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <div className="relative flex items-center justify-between gap-1 border-t px-2 py-2">
        <button
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className="group -ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left text-muted-foreground text-xs transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Switch Backend Profile"
        >
          <span
            className={`inline-block size-2 shrink-0 rounded-full ${
              backendStatus === "connected"
                ? "bg-green-500"
                : backendStatus === "connecting"
                  ? "animate-pulse bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <div className="min-w-0 flex-1 truncate font-medium">
            {activeProfile || "Unknown"}
            <span className="ml-1 hidden font-normal opacity-70 xl:inline">
              (
              {backendStatus === "connected"
                ? "Connected"
                : backendStatus === "connecting"
                  ? "Connecting"
                  : "Disconnected"}
              )
            </span>
          </div>
          <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>

        {showProfileMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowProfileMenu(false)}
            />
            <div className="absolute bottom-full left-2 z-50 mb-2 flex w-48 flex-col overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground text-xs shadow-md">
              <div className="mb-1 border-b px-2 py-1.5 font-semibold text-muted-foreground opacity-70">
                Backend Profiles
              </div>
              {profiles.map((p) => {
                const isActive = p === activeProfile;
                const instStatus = instances[p]?.status || "Stopped";
                const isRunning =
                  instStatus === "Running" || instStatus === "Starting";
                return (
                  <div
                    key={p}
                    className={`flex cursor-pointer items-center justify-between px-2 py-1.5 hover:bg-accent hover:text-accent-foreground ${isActive ? "bg-accent/50" : ""}`}
                    onClick={async () => {
                      if (!isActive) await switchBackend(p);
                      setShowProfileMenu(false);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`inline-block size-1.5 shrink-0 rounded-full ${isRunning ? "bg-green-500" : "bg-transparent"}`}
                      />
                      <span className="truncate">{p}</span>
                    </div>
                    {isRunning && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await closeBackend(p);
                        }}
                        className="rounded p-0.5 opacity-70 hover:bg-destructive/20 hover:text-destructive hover:opacity-100"
                        title="Stop Instance"
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
              {profiles.length === 0 && (
                <div className="px-2 py-1.5 opacity-50">No profiles found</div>
              )}
            </div>
          </>
        )}

        <button
          onClick={async () => {
            setRestarting(true);
            await restartBackend();
            setRestarting(false);
          }}
          disabled={restarting}
          className="ml-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
          title="Restart Active Backend"
        >
          <RotateCwIcon
            className={`size-4 ${restarting ? "animate-spin" : ""}`}
          />
        </button>
      </div>
    </div>
  );
};
