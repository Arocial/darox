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

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function WindowTitleUpdater() {
  const activeId = useAgentTabs((s) => s.activeId);
  const tabs = useAgentTabs((s) => s.tabs);
  const isStreaming = useAgentTabs((s) => s.isStreaming);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

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
    const hasStreaming = Object.values(isStreaming[activeId] || {}).some(
      (v) => v,
    );

    if (hasStreaming) {
      let frameIndex = 0;
      const updateTitle = () => {
        document.title = `${SPINNER_FRAMES[frameIndex]} ${dirName} - Darox`;
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      };
      updateTitle(); // Initial set
      intervalId = setInterval(updateTitle, 80);
    } else {
      document.title = `${dirName} - Darox`;
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeId, tabs, isStreaming]);

  return null;
}
