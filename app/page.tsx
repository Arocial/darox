"use client";

import { useEffect, useState } from "react";
import { useAgentTabs } from "@/components/darox-ui/agent-store";
import { AgentTabBar } from "@/components/darox-ui/agent-tab-bar";
import { AgentTabPanel } from "@/components/darox-ui/agent-tab-panel";
import {
  useBackendStore,
  isDesktop,
} from "@/components/darox-ui/backend-store";
import { BrowserApiPrompt } from "@/components/darox-ui/browser-api-prompt";
import { WindowTitleUpdater } from "@/components/darox-ui/window-title-updater";

export default function Chat() {
  const { tabs, activeId, loading, loadSessions } = useAgentTabs();
  const backendStatus = useBackendStore((s) => s.status);
  const processStatus = useBackendStore((s) => s.processStatus);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const backend = useBackendStore.getState();
    let unlisten: (() => void) | undefined;
    backend.setupDesktopListeners().then((fn) => {
      unlisten = fn;
    });
    if (!isDesktop) {
      backend.probeBackend();
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (backendStatus === "connected") {
      loadSessions();
    }
  }, [backendStatus, loadSessions]);

  if (!mounted) {
    return null;
  }

  if (!isDesktop && backendStatus !== "connected") {
    return <BrowserApiPrompt />;
  }

  if (processStatus === "starting" && backendStatus !== "connected") {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span>Starting backend...</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Loading agents...
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-row">
      <WindowTitleUpdater />
      <AgentTabBar />
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${
              activeId === tab.id ? "visible z-10" : "invisible z-0"
            }`}
          >
            <AgentTabPanel
              agentId={tab.id}
              workspace={tab.workspace}
              mainAgent={tab.main_agent}
              subagents={tab.subagents}
            />
          </div>
        ))}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No agents open. Click &quot;New&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
