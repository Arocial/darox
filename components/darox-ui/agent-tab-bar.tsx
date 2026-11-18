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
  TrashIcon,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  summaryToAgentTab,
  useAgentTabs,
} from "@/components/darox-ui/agent-store";
import { SidebarSettings } from "@/components/darox-ui/sidebar-settings";
import type {
  AgentTab,
  SessionSummary,
} from "@/components/darox-ui/agent-store";

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

function workspaceName(workspace?: string | null) {
  return (
    workspace?.split(/[\\/]/).filter(Boolean).pop() || workspace || "Untitled"
  );
}

function measureWorkspacePath(row: HTMLButtonElement) {
  const path = row.querySelector<HTMLElement>(".workspace-path");
  const text = path?.firstElementChild;
  if (!path || !text) return;
  const overflow = text.getBoundingClientRect().width - path.clientWidth;
  path.toggleAttribute("data-overflow", overflow > 1);
  if (overflow <= 1) return;
  const travelSeconds = overflow / 35;
  const cycleSeconds = travelSeconds + 2;
  path.style.setProperty("--workspace-path-offset", `${-overflow}px`);
  path.style.setProperty("--workspace-path-duration", `${cycleSeconds}s`);
  path.style.setProperty(
    "--workspace-path-arrival",
    `${(travelSeconds / cycleSeconds) * 100}%`,
  );
}

const workspacePathHandlers = {
  onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    measureWorkspacePath(event.currentTarget);
    event.currentTarget.setAttribute("data-path-hover", "");
  },
  onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch") {
      event.currentTarget.removeAttribute("data-path-hover");
    }
  },
  onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.matches(":focus-visible")) {
      measureWorkspacePath(event.currentTarget);
    }
  },
};

function WorkspacePath({ path }: { path?: string | null }) {
  if (!path) return null;
  return (
    <span
      className="workspace-path min-w-0 font-normal text-muted-foreground text-xs"
      dir="ltr"
      title={path}
    >
      <span>{path}</span>
    </span>
  );
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
  const dir = prompt("Enter workspace directory path on the backend computer:");
  return dir || null;
}

function lastUserMessages(session?: SessionSummary): string[] {
  const messages = session?.metadata?.last_user_messages;
  return Array.isArray(messages)
    ? messages.filter(
        (message): message is string => typeof message === "string",
      )
    : [];
}

const ActiveTabItem = ({
  tab,
  session,
  activeId,
  completionUnread,
  onSelect,
  onReset,
  onClose,
}: {
  tab: AgentTab;
  session?: SessionSummary;
  activeId: string | null;
  completionUnread: Record<string, boolean>;
  onSelect: (id: string) => void;
  onReset: (e: React.MouseEvent, id: string, workspace: string) => void;
  onClose: (e: React.MouseEvent, id: string) => void;
}) => {
  const dirName = workspaceName(tab.workspace);
  const messages = lastUserMessages(session);
  const hasUnreadCompletion = Object.values(completionUnread || {}).some(
    (v) => v,
  );
  const isActive = activeId === tab.id;
  return (
    <div
      className={`group relative flex w-full items-start gap-1 border-r-2 px-3 py-2 transition-colors ${
        isActive
          ? "border-primary bg-accent text-foreground shadow-sm"
          : "border-transparent text-foreground/80 hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <button
        onClick={() => onSelect(tab.id)}
        {...workspacePathHandlers}
        className="workspace-path-row flex min-w-0 flex-1 items-start gap-2 text-left"
        title={messages.length > 0 ? messages.join("\n") : tab.workspace}
      >
        <MessageSquareIcon
          className={`mt-0.5 size-4 shrink-0 ${isActive ? "text-primary" : "opacity-70"}`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`flex items-center gap-1.5 text-sm ${isActive ? "font-bold" : "font-medium"}`}
            title={tab.workspace}
          >
            <span className="max-w-1/2 shrink-0 truncate">{dirName}</span>
            {hasUnreadCompletion && (
              <span
                className="size-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                title="Task completed"
              />
            )}
            <WorkspacePath path={tab.workspace} />
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground text-xs">
            <span className="flex-1 truncate">
              {messages[messages.length - 1] || "Empty session"}
            </span>
            <span className="shrink-0 text-[10px] opacity-70">
              {formatRelativeTime(session?.updated_at)}
            </span>
          </div>
        </div>
      </button>
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <button
          onClick={(e) => onReset(e, tab.id, tab.workspace)}
          className={`rounded-sm p-0.5 transition-opacity hover:bg-foreground/20 hover:text-foreground focus-visible:opacity-100 max-md:opacity-100 ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          title="New chat in workspace"
          aria-label="New chat in workspace"
        >
          <SquarePenIcon className="size-3.5" />
        </button>
        <button
          onClick={(e) => onClose(e, tab.id)}
          className={`rounded-sm p-0.5 transition-opacity hover:bg-destructive/20 hover:text-destructive focus-visible:opacity-100 max-md:opacity-100 ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          title="Close tab"
          aria-label="Close tab"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
};

const WorkspaceItem = ({
  workspace,
  onSelect,
}: {
  workspace: string;
  onSelect: (ws: string) => void;
}) => {
  const dirName = workspaceName(workspace);
  return (
    <button
      onClick={() => onSelect(workspace)}
      {...workspacePathHandlers}
      className="workspace-path-row flex w-full items-start gap-2 border-transparent border-r-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <FolderIcon className="mt-0.5 size-4 shrink-0 opacity-70" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" title={workspace}>
          {dirName}
        </div>
        <WorkspacePath path={workspace} />
      </div>
    </button>
  );
};

const SessionItem = ({
  session,
  onSelect,
  onDelete,
}: {
  session: SessionSummary;
  onSelect: (session: SessionSummary) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) => {
  const workspace = session.workspace;
  const dirName = workspaceName(workspace);
  const lastMessages = lastUserMessages(session);
  const tooltipText =
    lastMessages && lastMessages.length > 0
      ? lastMessages.join("\n")
      : workspace || undefined;

  return (
    <button
      onClick={() => onSelect(session)}
      {...workspacePathHandlers}
      className="workspace-path-row group flex w-full items-start gap-2 border-transparent border-r-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      title={tooltipText}
    >
      <MessageSquareIcon className="mt-0.5 size-4 shrink-0 opacity-70" />
      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-1.5 text-sm"
          title={workspace || undefined}
        >
          <span className="max-w-1/2 shrink-0 truncate">
            {dirName || session.id.slice(0, 8)}
          </span>
          <WorkspacePath path={workspace} />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground text-xs">
          <span className="flex-1 truncate">
            {lastMessages && lastMessages.length > 0
              ? lastMessages[lastMessages.length - 1]
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
    completionUnread,
    closingSessionIds,
    sessions,
    loadSessions,
    deleteSession,
    openSession,
  } = useAgentTabs();

  const [showWorkspaces, setShowWorkspaces] = useState(true);
  const [showSessions, setShowSessions] = useState(true);

  const handleAdd = useCallback(async () => {
    const workspace = await pickDirectory();
    if (!workspace) return;
    await createAgent(workspace);
  }, [createAgent]);

  const handleClose = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!(await deleteAgent(id))) toast.error("Failed to stop session");
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
      if (newTab && !(await deleteAgent(id))) {
        toast.error("Failed to stop session");
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
    async (session: SessionSummary) => {
      await openSession(session.id);
    },
    [openSession],
  );

  const openSessionIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  // A running session can be discovered after the initial tab load (for example,
  // when another client starts it). Give it the same actions as an opened tab.
  const activeTabs = useMemo(
    () => [
      ...tabs.filter((tab) => !closingSessionIds.has(tab.id)),
      ...sessions
        .filter(
          (session) =>
            session.active &&
            !openSessionIds.has(session.id) &&
            !closingSessionIds.has(session.id),
        )
        .map(summaryToAgentTab),
    ],
    [tabs, sessions, openSessionIds, closingSessionIds],
  );
  const availableSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !session.active &&
          !openSessionIds.has(session.id) &&
          !closingSessionIds.has(session.id),
      ),
    [sessions, openSessionIds, closingSessionIds],
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
        {activeTabs.length > 0 && (
          <div className="mb-4">
            <div className="px-3 py-1.5 font-bold text-primary text-xs uppercase tracking-wider">
              Active
            </div>
            {activeTabs.map((tab) => (
              <ActiveTabItem
                key={tab.id}
                tab={tab}
                session={sessionsById.get(tab.id)}
                activeId={activeId}
                completionUnread={completionUnread[tab.id]}
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
      <SidebarSettings />
    </div>
  );
};
