"use client";

import { useMessagePartText } from "@assistant-ui/react";
import { AlertTriangleIcon, WrenchIcon } from "lucide-react";
import { type FC, memo } from "react";

import type { ChatInputEventResult } from "@/app/page";

const UserMessageTextImpl: FC = () => {
  const { text } = useMessagePartText();

  let parsed: ChatInputEventResult | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON — render as plain text
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  if (!parsed) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  const hasNormalInput = !!parsed.normal_input?.user_input;
  const hasDeferredTools =
    parsed.deferred_tools && Object.keys(parsed.deferred_tools).length > 0;
  const hasException =
    parsed.exception_input && "retry" in parsed.exception_input;
  const isExceptionOnly = !hasNormalInput && !hasDeferredTools && hasException;

  return (
    <div className="flex flex-col gap-2">
      {hasNormalInput && (
        <p className="whitespace-pre-wrap">{parsed.normal_input.user_input}</p>
      )}

      {hasDeferredTools && (
        <div className="flex flex-col gap-1.5">
          {Object.entries(parsed.deferred_tools).map(([id, answer]) => (
            <div
              key={id}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <WrenchIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{answer}</span>
            </div>
          ))}
        </div>
      )}

      {isExceptionOnly && (
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangleIcon className="size-3.5 shrink-0 text-destructive" />
          <span>
            {parsed.exception_input.retry ? "Retry" : "Stop"}
          </span>
        </div>
      )}
    </div>
  );
};

export const UserMessageText = memo(UserMessageTextImpl);
