"use client";

import { useEffect, useState } from "react";
import { useAgentTabs } from "@/components/darox-ui/agent-store";
import { AgentNavigation } from "@/components/darox-ui/agent-navigation";
import { AgentTabPanel } from "@/components/darox-ui/agent-tab-panel";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import { ManagerConnectionPrompt } from "@/components/darox-ui/manager-connections";
import { WindowTitleUpdater } from "@/components/darox-ui/window-title-updater";

export default function Chat() {
  const { tabs, activeId, loading } = useAgentTabs();
  const backendStatus = useBackendStore((s) => s.status);
  const managers = useBackendStore((s) => s.managers);
  const connectionRevision = useBackendStore((s) => s.connectionRevision);
  const activeManagerId = useBackendStore((s) => s.activeManagerId);
  const connections = useBackendStore((s) => s.connections);
  const activeBackendId = useBackendStore((s) => s.activeBackendId);
  const activeProfile = useBackendStore((s) => s.activeProfile);

  const [mounted, setMounted] = useState(false);
  const [renderedTabs, setRenderedTabs] = useState<string[]>([]);
  const MAX_TABS = 5;

  useEffect(() => {
    setMounted(true);
  }, []);

  // A different profile or worker execution needs a fresh session list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity changes can keep the same connected status.
  useEffect(() => {
    if (backendStatus === "connected")
      void useAgentTabs.getState().loadAgents();
  }, [backendStatus, activeBackendId, connectionRevision]);

  useEffect(() => {
    if (activeId) {
      setRenderedTabs((prev) => {
        const filtered = prev.filter((id) => id !== activeId);
        const updated = [...filtered, activeId];
        if (updated.length > MAX_TABS) {
          return updated.slice(updated.length - MAX_TABS);
        }
        return updated;
      });
    }
  }, [activeId]);

  useEffect(() => useBackendStore.getState().initialize(), []);

  if (!mounted) {
    return null;
  }

  if (managers.length === 0) {
    return <ManagerConnectionPrompt />;
  }

  const connection = activeManagerId ? connections[activeManagerId] : undefined;
  const profile = connection?.profiles.find(
    (item) => item.id === activeProfile,
  );
  const backendError = connection?.error || profile?.last_error;

  if (loading && backendStatus === "connected") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading agents...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WindowTitleUpdater />
      <AgentNavigation />
      <div className="relative min-h-0 min-w-0 flex-1">
        {backendStatus === "connected" &&
          tabs.map((tab) => {
            if (!renderedTabs.includes(tab.id)) return null;
            return (
              <div
                key={`${activeBackendId}:${connectionRevision}:${tab.id}`}
                className={`absolute inset-0 ${
                  activeId === tab.id ? "visible z-10" : "invisible z-0"
                }`}
              >
                <AgentTabPanel
                  agentId={tab.id}
                  workspace={tab.workspace}
                  agentTab={tab}
                />
              </div>
            );
          })}
        {backendStatus !== "connected" && backendError && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="w-full max-w-2xl rounded-lg border border-destructive/40 bg-card p-5 shadow-sm">
              <h1 className="font-semibold text-destructive">
                Backend unavailable
              </h1>
              <p className="mt-2 text-sm">{backendError}</p>
              {profile?.exit_code != null && (
                <p className="mt-1 text-muted-foreground text-xs">
                  Exit code: {profile.exit_code}
                </p>
              )}
              <p className="mt-3 text-muted-foreground text-xs">
                Use the Backend menu to edit the Manager connection or restart a
                profile.
              </p>
            </div>
          </div>
        )}
        {backendStatus !== "connected" && !backendError && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {backendStatus === "connecting"
              ? "Connecting…"
              : "Select a profile in the Backend menu to connect or start it."}
          </div>
        )}
        {backendStatus === "connected" && tabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No agents open. Click &quot;New&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
