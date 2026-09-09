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
import { isDesktop, useBackendStore } from "./backend-store";
import { CustomBackendDialog } from "./browser-api-prompt";
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

function BackendActions({
  custom,
  pending,
  spinning,
  connecting,
  canStop,
  onRestart,
  onStop,
}: {
  custom: boolean;
  pending: boolean;
  spinning: boolean;
  connecting: boolean;
  canStop: boolean;
  onRestart: () => void;
  onStop: () => void;
}) {
  const restartLabel = custom ? "Reconnect" : "Restart Backend";
  const stopLabel = custom ? "Disconnect" : "Stop Backend";

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label={restartLabel}
        title={restartLabel}
        disabled={pending || connecting}
        onClick={onRestart}
        className="rounded p-1.5 text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <RotateCwIcon
          className={`size-3.5 ${spinning ? "animate-spin" : ""}`}
        />
      </button>
      {canStop && (
        <button
          type="button"
          aria-label={stopLabel}
          title={stopLabel}
          disabled={pending}
          onClick={onStop}
          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <PowerIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function SidebarSettings() {
  const backend = useBackendStore();
  const { preference, resolvedMode, setPreference } = useStreamModeStore();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const pending = pendingAction !== null;
  const id = useId();
  const activeCustomId = backend.activeBackendId?.startsWith("custom:")
    ? backend.activeBackendId.slice("custom:".length)
    : undefined;
  const activeCustom = backend.customBackends.find(
    (item) => item.id === activeCustomId,
  );
  const custom = Boolean(activeCustom);
  const name = custom
    ? activeCustom?.name || "Custom Backend"
    : backend.activeProfile || "No Backend";
  const resolvedLabel = resolvedMode === "full" ? "Full" : "Concise";
  const modeLabel =
    preference === "auto" ? `Auto · ${resolvedLabel}` : resolvedLabel;
  const status =
    backend.status === "connected"
      ? "Connected"
      : backend.status === "connecting"
        ? "Connecting"
        : "Disconnected";
  const statusColor =
    backend.status === "connected"
      ? "bg-green-500"
      : backend.status === "connecting"
        ? "animate-pulse bg-yellow-500"
        : "bg-red-500";
  const activeInstance = backend.activeProfile
    ? backend.instances[backend.activeProfile]
    : undefined;
  function profileStatus(profile: string) {
    if (backend.activeBackendId === `profile:${profile}`) {
      return { label: status, color: statusColor };
    }
    const processStatus = backend.instances[profile]?.status || "Stopped";
    if (processStatus === "Running") {
      return { label: "Running", color: "bg-green-500" };
    }
    if (processStatus === "Starting") {
      return { label: "Starting", color: "animate-pulse bg-yellow-500" };
    }
    if (processStatus === "StartFailed" || processStatus === "Crashed") {
      return { label: processStatus, color: "bg-red-500" };
    }
    return { label: "Stopped", color: "bg-muted-foreground/40" };
  }

  async function runAction(actionId: string, action: () => unknown) {
    setPendingAction(actionId);
    try {
      const result = await action();
      if (result === false) {
        toast.error("Unable to connect. Check the Backend URL and token.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Backend operation failed",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="shrink-0 border-t p-2">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Backend and response settings: ${name}, ${status}, ${modeLabel}`}
            title={`${name} · ${status} · ${modeLabel}`}
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
            className="z-50 max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none"
          >
            <div className="space-y-3 p-4">
              <h2 className="font-medium text-sm">Backend</h2>
              <div
                role="list"
                aria-label="Backend"
                className="-mx-1 max-h-52 space-y-0.5 overflow-y-auto px-1"
              >
                {isDesktop &&
                  backend.profiles.map((profile) => {
                    const active =
                      backend.activeBackendId === `profile:${profile}`;
                    const itemStatus = profileStatus(profile);
                    return (
                      <div
                        key={profile}
                        role="listitem"
                        className={`flex min-w-0 items-center rounded-md transition-colors hover:bg-accent ${active ? "bg-accent/60" : ""}`}
                      >
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          disabled={pending}
                          title={`${profile} · ${itemStatus.label}`}
                          onClick={() => {
                            if (!active) {
                              void runAction(`switch:${profile}`, () =>
                                backend.switchBackend(profile),
                              );
                            }
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
                        >
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${itemStatus.color}`}
                          />
                          <span
                            className={`min-w-0 flex-1 truncate ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                          >
                            {profile}
                          </span>
                        </button>
                        <BackendActions
                          custom={false}
                          pending={pending}
                          spinning={pendingAction === `restart:${profile}`}
                          connecting={
                            itemStatus.label === "Connecting" ||
                            itemStatus.label === "Starting"
                          }
                          canStop={
                            backend.instances[profile]?.status === "Running" ||
                            backend.instances[profile]?.status === "Starting"
                          }
                          onRestart={() =>
                            void runAction(`restart:${profile}`, () =>
                              backend.restartBackend(profile),
                            )
                          }
                          onStop={() =>
                            void runAction(`stop:${profile}`, () =>
                              backend.closeBackend(profile),
                            )
                          }
                        />
                      </div>
                    );
                  })}
                {backend.customBackends.map((customBackend) => {
                  const active = activeCustomId === customBackend.id;
                  const itemStatus = active
                    ? { label: status, color: statusColor }
                    : {
                        label: "Not selected",
                        color: "bg-muted-foreground/40",
                      };
                  return (
                    <div
                      key={customBackend.id}
                      role="listitem"
                      className={`flex min-w-0 items-center rounded-md transition-colors hover:bg-accent ${active ? "bg-accent/60" : ""}`}
                    >
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        disabled={pending}
                        title={`${customBackend.name} · ${customBackend.url} · ${itemStatus.label}`}
                        onClick={() => {
                          if (!active) {
                            void runAction(
                              `switch:custom:${customBackend.id}`,
                              () =>
                                backend.selectCustomBackend(customBackend.id),
                            );
                          }
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${itemStatus.color}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                          >
                            {customBackend.name}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground/70">
                            {customBackend.url}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Edit ${customBackend.name}`}
                          title="Edit"
                          disabled={pending}
                          onClick={() => {
                            setEditingCustomId(customBackend.id);
                            setOpen(false);
                            setCustomOpen(true);
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                        <BackendActions
                          custom
                          pending={pending}
                          spinning={
                            pendingAction ===
                            `restart:custom:${customBackend.id}`
                          }
                          connecting={active && backend.status === "connecting"}
                          canStop={active && backend.status !== "disconnected"}
                          onRestart={() =>
                            void runAction(
                              `restart:custom:${customBackend.id}`,
                              () =>
                                backend.selectCustomBackend(customBackend.id),
                            )
                          }
                          onStop={() =>
                            void runAction(
                              `stop:custom:${customBackend.id}`,
                              () =>
                                backend.disconnectCustomBackend(
                                  customBackend.id,
                                ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Delete ${customBackend.name}`}
                          title="Delete"
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete custom backend “${customBackend.name}”?`,
                              )
                            ) {
                              backend.deleteCustomBackend(customBackend.id);
                            }
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {backend.profiles.length === 0 &&
                  backend.customBackends.length === 0 && (
                    <div className="px-2 py-2 text-muted-foreground text-xs">
                      No Backend configured
                    </div>
                  )}
              </div>
              {!custom && activeInstance?.error && (
                <p
                  role="alert"
                  className="break-words text-destructive text-xs"
                >
                  {activeInstance.error.message}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingCustomId(undefined);
                  setOpen(false);
                  setCustomOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusIcon className="size-3.5" />
                Add Custom Backend…
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
      <CustomBackendDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        backendId={editingCustomId}
      />
    </div>
  );
}
