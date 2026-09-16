import type { FC } from "react";
import { CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import { ActionBarPrimitive, AuiIf } from "@assistant-ui/react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root fade-in flex animate-in gap-1 text-muted-foreground duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy" className="aui-user-action-copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="zoom-in-50 fade-in animate-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="zoom-in-75 fade-in animate-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};
