"use client";

import { useEffect } from "react";
import { useAgentTabs } from "@/components/darox-ui/agent-store";

function formatTabLabel(workspace: string) {
  if (!workspace || typeof workspace !== "string") {
    return { dirName: "Unknown" };
  }
  const parts = workspace.replace(/\/+$/, "").split("/");
  const dirName = parts[parts.length - 1] || workspace;
  return { dirName };
}

export function WindowTitleUpdater() {
  const activeId = useAgentTabs((s) => s.activeId);
  const tabs = useAgentTabs((s) => s.tabs);
  const needsInput = useAgentTabs((s) => s.needsInput);
  const isStreaming = useAgentTabs((s) => s.isStreaming);

  useEffect(() => {
    if (!activeId) {
      document.title = "Darox";
      return;
    }

    const activeTab = tabs.find((t) => t.id === activeId);
    if (!activeTab) {
      document.title = "Darox";
      return;
    }

    const { dirName } = formatTabLabel(activeTab.workspace);
    const hasInputRequest = Object.values(needsInput[activeId] || {}).some(
      (v) => v,
    );
    const hasStreaming = Object.values(isStreaming[activeId] || {}).some(
      (v) => v,
    );

    const busy = hasInputRequest || hasStreaming;
    document.title = busy ? `[Busy] ${dirName} - Darox` : `${dirName} - Darox`;
  }, [activeId, tabs, needsInput, isStreaming]);

  return null;
}
