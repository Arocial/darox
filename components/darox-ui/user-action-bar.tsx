"use client";

import type { FC } from "react";
import { PencilIcon } from "lucide-react";
import { ActionBarPrimitive, useAuiState } from "@assistant-ui/react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { CopyTextButton } from "@/components/darox-ui/copy-text-button";

export const UserActionBar: FC = () => {
  const text = useAuiState((s) =>
    s.message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n"),
  );

  return (
    <ActionBarPrimitive.Root className="aui-user-action-bar-root fade-in flex animate-in gap-1 text-muted-foreground duration-200">
      <CopyTextButton text={text} className="aui-user-action-copy" />
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};
