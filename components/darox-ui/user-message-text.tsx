"use client";

import { useMessage, useMessagePartText } from "@assistant-ui/react";
import { AlertTriangleIcon, WrenchIcon } from "lucide-react";
import { type FC, memo } from "react";

import type { ChatInputEventResult } from "@/types/chat";

const UserMessageTextImpl: FC = () => {
  const { text } = useMessagePartText();
  const message = useMessage();

  const parsed = (message.metadata?.custom as any)?.chatInputEventResult as
    | ChatInputEventResult
    | undefined;

  if (!parsed) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  const hasNormalInput = !!parsed.normal_input?.user_input;
  const hasDeferredTools =
    parsed.deferred_tools && Object.keys(parsed.deferred_tools).length > 0;
  const hasException =
    parsed.exception_input && "retry" in parsed.exception_input;

  const isExceptionReply =
    (parsed as any)._isExceptionReply === true ||
    (!hasNormalInput && !hasDeferredTools && hasException);

  return (
    <div className="flex flex-col gap-2">
      {text && <p className="whitespace-pre-wrap">{text}</p>}

      {hasDeferredTools && (
        <div className="flex flex-col gap-1.5">
          {Object.entries(parsed.deferred_tools).map(([id, answer]) => (
            <div
              key={id}
              className="flex items-start gap-2 text-muted-foreground text-sm"
            >
              <WrenchIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{answer}</span>
            </div>
          ))}
        </div>
      )}

      {isExceptionReply && (
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangleIcon className="size-3.5 shrink-0 text-destructive" />
          <span>Retry</span>
        </div>
      )}
    </div>
  );
};

export const UserMessageText = memo(UserMessageTextImpl);
