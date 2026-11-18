import {
  containsSession,
  type SessionInfo,
  sessionToAgentTab,
  useAgentTabs,
} from "@/components/darox-ui/agent-store";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import type {
  TurnNotificationInput,
  TurnNotificationTarget,
} from "@/electron/turn-notifications";
import { managerRequest } from "@/lib/manager-client";
import { refreshManager } from "@/lib/manager-monitor";

let latestActivation = 0;

export async function focusNotificationSession(
  target: TurnNotificationTarget,
): Promise<void> {
  const activation = ++latestActivation;
  const { managerId, profileId, startedAt, sessionPath } = target;
  const manager = useBackendStore
    .getState()
    .managers.find((m) => m.id === managerId);
  if (!manager) return;

  try {
    await refreshManager(managerId);
    if (activation !== latestActivation) return;
    const backend = useBackendStore.getState();
    const connection = backend.connections[managerId];
    const profile = connection?.profiles.find((p) => p.id === profileId);
    if (
      !backend.managers.includes(manager) ||
      connection?.status !== "connected" ||
      profile?.status !== "running" ||
      (profile.started_at ?? null) !== startedAt
    )
      return;

    // Check that the target still exists before changing the visible profile.
    const sessions = await managerRequest<SessionInfo[]>(
      manager,
      `/${encodeURIComponent(profileId)}/proxy/api/sessions`,
    );
    const tab = sessions
      .filter((session) => session.active)
      .map(sessionToAgentTab)
      .find((tab) => containsSession(tab, sessionPath));
    const current = useBackendStore.getState();
    if (
      !tab ||
      activation !== latestActivation ||
      !current.managers.includes(manager) ||
      current.activeManagerId !== backend.activeManagerId ||
      current.activeProfile !== backend.activeProfile ||
      !current.selectRunningProfile(managerId, profileId, startedAt)
    )
      return;

    useAgentTabs.getState().focusSession(tab, sessionPath);
  } catch {
    // The window is already visible; an unavailable session is not actionable.
  }
}

export function listenForTurnNotificationClicks(): (() => void) | undefined {
  const api = window.darox;
  if (!api?.onTurnNotificationClick || !api.takeTurnNotificationTarget) return;
  const take = () => {
    void api
      .takeTurnNotificationTarget()
      .then((target) => {
        if (target) void focusNotificationSession(target);
      })
      .catch(console.error);
  };
  const unsubscribe = api.onTurnNotificationClick(take);
  take();
  return unsubscribe;
}

export async function notifyTurnCompletion(
  agentName: string,
  workspace: string,
  sessionPath: string,
  apiBase: string,
): Promise<void> {
  const backend = useBackendStore.getState();
  const managerId = backend.activeManagerId;
  const profileId = backend.activeProfile;
  const profile =
    managerId &&
    backend.connections[managerId]?.profiles.find((p) => p.id === profileId);
  const target =
    managerId && profile && backend.apiBase === apiBase
      ? {
          managerId,
          profileId,
          startedAt: profile.started_at ?? null,
          sessionPath,
        }
      : null;
  const input: TurnNotificationInput = {
    title: `Turn completed: ${agentName}`,
    body: `Task completed in ${workspace}`,
    target,
  };
  try {
    if (await window.darox?.showTurnNotification?.(input)) return;
  } catch (error) {
    console.error("Failed to show desktop notification", error);
  }

  if (!("Notification" in window) || Notification.permission === "denied")
    return;
  try {
    if (
      Notification.permission !== "granted" &&
      (await Notification.requestPermission()) !== "granted"
    )
      return;
    const notification = new Notification(input.title, { body: input.body });
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (target) void focusNotificationSession(target);
    };
  } catch (error) {
    console.error("Failed to show browser notification", error);
  }
}
