"use client";

import {
  ChevronUpIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import { profileKey, useBackendStore } from "./backend-store";
import { ManagerDialog } from "./manager-connections";
import {
  useStreamModeStore,
  type StreamModePreference,
} from "./stream-mode-store";

const modes: {
  value: StreamModePreference;
  label: string;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Choose based on the window size at startup.",
  },
  {
    value: "full",
    label: "Full",
    description: "Show intermediate model and tool activity.",
  },
  {
    value: "concise",
    label: "Concise",
    description: "Show user input, running status, and completed output.",
  },
];

const actionClass =
  "rounded p-1.5 text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

export function SidebarSettings() {
  const backend = useBackendStore();
  const { preference, resolvedMode, setPreference } = useStreamModeStore();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const id = useId();
  const activeManager = backend.managers.find(
    (manager) => manager.id === backend.activeManagerId,
  );
  const name = activeManager
    ? `${activeManager.name}${backend.activeProfile ? ` / ${backend.activeProfile}` : ""}`
    : "No Manager";
  const resolvedLabel = resolvedMode === "full" ? "Full" : "Concise";
  const modeLabel =
    preference === "auto" ? `Auto · ${resolvedLabel}` : resolvedLabel;
  const statusColor =
    backend.status === "connected"
      ? "bg-green-500"
      : backend.status === "connecting"
        ? "animate-pulse bg-yellow-500"
        : "bg-red-500";

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Manager operation failed.",
      );
    }
  }

  return (
    <div className="shrink-0 border-t p-2">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Backend and response settings: ${name}, ${backend.status}, ${modeLabel}`}
            title={`${name} · ${backend.status} · ${modeLabel}`}
            className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/50"
          >
            <span className={`size-2 shrink-0 rounded-full ${statusColor}`} />
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            <span className="shrink-0 text-muted-foreground">{modeLabel}</span>
            <ChevronUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={10}
            collisionPadding={12}
            aria-label="Backend and response settings"
            className="z-50 max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none"
          >
            <div className="space-y-3 p-4">
              <h2 className="font-medium text-sm">Managers</h2>
              <div
                className="max-h-80 space-y-3 overflow-y-auto"
                role="list"
                aria-label="Managers"
              >
                {backend.managers.map((manager) => {
                  const connection = backend.connections[manager.id];
                  return (
                    <div
                      key={manager.id}
                      role="listitem"
                      className="rounded-md border p-2"
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <div className="min-w-0 flex-1" title={manager.url}>
                          <div className="truncate font-medium text-sm">
                            {manager.name}
                          </div>
                          <div className="truncate text-muted-foreground text-xs">
                            {manager.url}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {connection?.status || "disconnected"}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Refresh ${manager.name}`}
                          title="Refresh connection"
                          className={actionClass}
                          onClick={() =>
                            void run(() => backend.refreshManager(manager.id))
                          }
                        >
                          <RotateCwIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${manager.name}`}
                          title="Edit connection"
                          className={actionClass}
                          onClick={() => {
                            setEditingId(manager.id);
                            setOpen(false);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${manager.name}`}
                          title="Delete connection"
                          className={actionClass}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete Manager connection “${manager.name}”? This will not stop its profiles.`,
                              )
                            ) {
                              backend.deleteManager(manager.id);
                            }
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                      {connection?.error && (
                        <p
                          role="alert"
                          className="mt-2 break-words text-destructive text-xs"
                        >
                          {connection.error}
                        </p>
                      )}
                      {connection?.status === "connected" &&
                        connection.profiles.length === 0 && (
                          <p className="mt-2 text-muted-foreground text-xs">
                            No profiles configured in this Manager.
                          </p>
                        )}
                      {connection?.profiles.map((profile) => {
                        const key = profileKey(manager.id, profile.id);
                        const active = backend.activeBackendId === key;
                        const pending = backend.pending[key];
                        const busy =
                          Boolean(pending) ||
                          profile.status === "starting" ||
                          profile.status === "stopping";
                        const unavailable = connection.status !== "connected";
                        return (
                          <div key={profile.id} className="mt-1">
                            <div
                              className={`flex min-w-0 items-center rounded-md hover:bg-accent ${active ? "bg-accent/60" : ""}`}
                            >
                              <button
                                type="button"
                                aria-current={active ? "true" : undefined}
                                disabled={busy || unavailable}
                                onClick={() =>
                                  void run(() =>
                                    backend.selectProfile(
                                      manager.id,
                                      profile.id,
                                    ),
                                  )
                                }
                                className="min-w-0 flex-1 rounded px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                              >
                                <span
                                  className={`block truncate ${active ? "font-semibold" : ""}`}
                                >
                                  {profile.id}
                                </span>
                                <span className="block text-muted-foreground text-xs">
                                  {profile.status}
                                </span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Restart ${manager.name} / ${profile.id}`}
                                title="Restart profile"
                                disabled={busy || unavailable}
                                className={actionClass}
                                onClick={() =>
                                  void run(() =>
                                    backend.profileAction(
                                      manager.id,
                                      profile.id,
                                      "restart",
                                    ),
                                  )
                                }
                              >
                                <RotateCwIcon
                                  className={`size-3.5 ${pending === "restart" ? "animate-spin" : ""}`}
                                />
                              </button>
                              {profile.status === "running" && (
                                <button
                                  type="button"
                                  aria-label={`Stop ${manager.name} / ${profile.id}`}
                                  title="Stop profile"
                                  disabled={busy || unavailable}
                                  className={actionClass}
                                  onClick={() =>
                                    void run(() =>
                                      backend.profileAction(
                                        manager.id,
                                        profile.id,
                                        "stop",
                                      ),
                                    )
                                  }
                                >
                                  <PowerIcon className="size-3.5" />
                                </button>
                              )}
                            </div>
                            {profile.last_error && (
                              <p
                                role="alert"
                                className="break-words px-2 text-destructive text-xs"
                              >
                                {profile.last_error}
                                {profile.exit_code !== null
                                  ? ` (exit ${profile.exit_code})`
                                  : ""}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingId(undefined);
                  setOpen(false);
                  setDialogOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusIcon className="size-3.5" />
                Add Manager…
              </button>
            </div>
            <fieldset className="min-w-0 border-t p-4">
              <legend className="sr-only">Response detail</legend>
              <div aria-hidden="true" className="mb-3 font-medium text-sm">
                Response detail
              </div>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {modes.map((mode) => (
                  <label
                    key={mode.value}
                    className="relative flex-1 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name={`${id}-detail`}
                      value={mode.value}
                      checked={preference === mode.value}
                      onChange={() => setPreference(mode.value)}
                      aria-describedby={`${id}-description`}
                      className="peer sr-only"
                    />
                    <span className="block rounded-md px-2 py-1.5 text-center font-medium text-muted-foreground text-xs peer-checked:bg-popover peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {mode.label}
                    </span>
                  </label>
                ))}
              </div>
              <p
                id={`${id}-description`}
                className="mt-2 text-muted-foreground text-xs leading-relaxed"
              >
                {modes.find((mode) => mode.value === preference)?.description}
                {preference === "auto" && (
                  <span className="mt-1 block">Currently: {resolvedLabel}</span>
                )}
              </p>
            </fieldset>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <ManagerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        backendId={editingId}
      />
    </div>
  );
}
