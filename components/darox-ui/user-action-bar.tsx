import type { FC } from "react";
import { GitBranchIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { ActionBarPrimitive, useAuiState } from "@assistant-ui/react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  useUserTurnAnchors,
  USER_INPUT_ID_KEY,
} from "@/components/darox-ui/user-turn-anchors-context";
import { useAgentTabs } from "@/components/darox-ui/agent-store";
import { useWorkspace } from "@/components/darox-ui/workspace-context";

export const UserActionBar: FC = () => {
  const anchorsCtx = useUserTurnAnchors();
  const anchorValue = useAuiState(
    (s) => s.message.metadata?.custom?.[USER_INPUT_ID_KEY],
  );
  const anchor = typeof anchorValue === "string" ? anchorValue : null;
  const workspace = useWorkspace();
  const openSession = useAgentTabs((s) => s.openSession);

  const onFork = async () => {
    if (anchorsCtx === null || anchor === null) {
      toast.error("Fork not available: missing turn anchor.");
      return;
    }
    try {
      const ack = await anchorsCtx.forkAt(anchor);
      if (ack.status !== "ok") {
        toast.error(ack.output || `Fork failed: ${ack.status}`);
        return;
      }
      const match = ack.output?.match(/New branch session id:\s*(\S+)/);
      const newSessionId = match?.[1];
      if (!newSessionId) {
        toast.error(ack.output || "Fork succeeded but no session id returned.");
        return;
      }
      const tab = await openSession(newSessionId, workspace);
      if (!tab) {
        toast.error("Forked, but failed to open new session.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fork request failed.");
    }
  };

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="always"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
      <TooltipIconButton
        tooltip={anchor !== null ? "Fork from this turn" : "Fork unavailable"}
        className="aui-user-action-fork p-4"
        onClick={onFork}
        disabled={anchor === null}
      >
        <GitBranchIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Root>
  );
};
