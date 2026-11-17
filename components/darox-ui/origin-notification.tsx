"use client";

import { MessagePrimitive, useAuiState } from "@assistant-ui/react";
import { TerminalIcon, UsersIcon } from "lucide-react";
import { UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { cn } from "@/lib/utils";
import { CopyTextButton } from "./copy-text-button";
import type { MessageOrigin } from "./message-origin";
import { UserMessageText } from "./user-message-text";

export function OriginNotification({
  origin,
}: {
  origin: Exclude<MessageOrigin, "user">;
}) {
  const text = useAuiState((s) =>
    s.message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n"),
  );
  const collaboration = origin === "collaboration";
  const Icon = collaboration ? UsersIcon : TerminalIcon;

  return (
    <MessagePrimitive.Root
      data-slot="darox-origin-notification"
      data-origin={origin}
      data-role="user"
      className="w-full min-w-0 self-start px-2"
    >
      <div
        className={cn(
          "rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm",
          collaboration && "border-l-2 border-l-sky-200 dark:border-l-sky-800",
        )}
      >
        <div
          className={cn(
            "mb-2 flex items-center gap-2 border-border/60 border-b pb-2 font-medium text-muted-foreground text-xs",
            collaboration &&
              "border-sky-200/60 text-sky-600 dark:border-sky-800/60 dark:text-sky-400",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          <span>{collaboration ? "Collaboration" : "Shell"}</span>
          <div className="ml-auto">
            <CopyTextButton text={text} />
          </div>
        </div>
        <UserMessageAttachments />
        <div className="wrap-break-word min-w-0 text-foreground">
          <MessagePrimitive.Parts components={{ Text: UserMessageText }} />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
