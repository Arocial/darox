import { useState, type FC } from "react";
import { ComposerPrimitive, useAui, useAuiState, AuiIf, TextMessagePartProvider, MessageProvider } from "@assistant-ui/react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";

import { ComposerAddAttachment, ComposerAttachments } from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { ComposerWithCommandMenu } from "@/components/darox-ui/command-menu";
import { useChatInput, defaultInputArgs } from "@/components/darox-ui/chat-input-context";
import type { ChatInputEventResult } from "@/app/page";

export const Composer: FC = () => {
  const { inputArgs, setInputArgs } = useChatInput();
  const aui = useAui();

  const [deferredTools, setDeferredTools] = useState<Record<string, string>>({});
  const [toContinue, setToContinue] = useState<boolean | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default send

    const state = aui.composer().getState();
    const text = state.text;
    const attachments = state.attachments;

    const result: ChatInputEventResult = {
      normal_input: {
        user_input: inputArgs.normal_input?.request ? text : null,
      },
      deferred_tools: deferredTools,
      exception_input: {
        to_continue: toContinue ?? true,
      },
    };

    aui.thread().append({
      role: "user",
      content: [{ type: "text", text: JSON.stringify(result) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: attachments as any,
    });
    aui.composer().reset();
    setDeferredTools({});
    setToContinue(null);
    setInputArgs(defaultInputArgs);
  };

  return (
    <ComposerPrimitive.Root 
      className="aui-composer-root relative flex w-full flex-col"
      onSubmit={handleSubmit}
    >
      {inputArgs.exception_input?.exception && (
        <div className="flex flex-col gap-2 rounded-md bg-destructive/10 p-3 text-destructive mb-2 mx-2 mt-2">
          <p className="text-sm font-medium">Exception Occurred</p>
          <p className="text-sm">{inputArgs.exception_input.exception}</p>
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="to_continue" checked={toContinue === true} onChange={() => setToContinue(true)} required />
              Continue
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="to_continue" checked={toContinue === false} onChange={() => setToContinue(false)} required />
              Stop
            </label>
          </div>
        </div>
      )}

      {Object.entries(inputArgs.deferred_tools || {}).map(([id, question]) => (
        <div key={id} className="flex flex-col gap-2 mb-2 mx-2 mt-2">
          <div className="text-sm font-medium text-foreground">
            <MessageProvider message={{ id: "mock", role: "assistant", content: [], createdAt: new Date(), metadata: {} }} index={0}>
              <TextMessagePartProvider text={question as string}>
                <MarkdownText />
              </TextMessagePartProvider>
            </MessageProvider>
          </div>
          <input
            type="text"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={deferredTools[id] || ""}
            onChange={(e) => setDeferredTools({ ...deferredTools, [id]: e.target.value })}
            required
          />
        </div>
      ))}

      <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50">
        <ComposerAttachments />
        <ComposerWithCommandMenu disabled={!inputArgs.normal_input?.request} />
        <ComposerAction />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  const { inputArgs } = useChatInput();
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const hasCustomInput = inputArgs && (Object.keys(inputArgs.deferred_tools || {}).length > 0 || inputArgs.exception_input?.exception);
  const isDisabled = isEmpty && !hasCustomInput;

  return (
    <div className="aui-composer-action-wrapper relative mx-2 mb-2 flex items-center justify-between">
      <ComposerAddAttachment />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <TooltipIconButton
          tooltip="Send message"
          side="bottom"
          type="submit"
          variant="default"
          size="icon"
          className="aui-composer-send size-8 rounded-full"
          aria-label="Send message"
          disabled={isDisabled}
        >
          <ArrowUpIcon className="aui-composer-send-icon size-4" />
        </TooltipIconButton>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};
