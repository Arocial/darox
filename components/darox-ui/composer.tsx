import { useState, type FC } from "react";
import { ComposerPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useAgentStatus } from "@/components/darox-ui/agent-status-context";

import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/attachment";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { ComposerWithCommandMenu } from "@/components/darox-ui/command-menu";
import {
  useWorkspace,
  historyKey,
} from "@/components/darox-ui/workspace-context";
import type { ChatInputEventResult } from "@/types/chat";
import { useChatSubmit } from "@/components/darox-ui/chat-submit-context";
import type { UIMessage } from "ai";
import { toast } from "sonner";

export const Composer: FC = () => {
  const workspace = useWorkspace();
  const aui = useAui();
  const status = useAgentStatus();
  const submitUserMessage = useChatSubmit();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDisabled = status === "closed";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default send

    const state = aui.composer().getState();
    const text = state.text;
    const rawAttachments = state.attachments;

    const processedAttachments = await Promise.all(
      rawAttachments.map(async (att) => {
        if (att.file instanceof File) {
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(att.file as File);
          });
          return {
            name: att.name || att.file.name,
            content: [{ type: "file", data: url, mimeType: att.file.type }],
          };
        }
        return att;
      }),
    );

    const trimmed = text.trim();
    if (trimmed) {
      const key = historyKey(workspace);
      const saved = localStorage.getItem(key);
      let history: string[] = [];
      if (saved) {
        try {
          history = JSON.parse(saved);
        } catch {}
      }
      const newHistory = [
        trimmed,
        ...history.filter((h) => h !== trimmed),
      ].slice(0, 50);
      localStorage.setItem(key, JSON.stringify(newHistory));
      window.dispatchEvent(new Event("cmd_history_updated"));
    }

    const clientMessageId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );

    const result: ChatInputEventResult = {
      client_message_id: clientMessageId,
      user_input: text,
    };

    const attachmentParts: UIMessage["parts"] = processedAttachments.flatMap(
      (attachment) =>
        (attachment.content ?? []).flatMap((part) => {
          if (part.type !== "file") return [];
          return [
            {
              type: "file" as const,
              url: part.data,
              mediaType: part.mimeType,
              ...(attachment.name && { filename: attachment.name }),
            },
          ];
        }),
    );
    const parts: UIMessage["parts"] = [
      ...attachmentParts,
      ...(result.user_input
        ? [{ type: "text" as const, text: result.user_input }]
        : []),
    ];
    const message: UIMessage = {
      id: clientMessageId,
      role: "user",
      parts,
      metadata: { custom: { chatInputEventResult: result } },
    };

    setIsSubmitting(true);
    try {
      await submitUserMessage(message);
      aui.composer().reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ComposerPrimitive.Root
      className="aui-composer-root relative flex w-full flex-col"
      onSubmit={handleSubmit}
    >
      <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50">
        <ComposerAttachments />
        <ComposerWithCommandMenu disabled={isDisabled} />
        <ComposerAction
          disabled={status === "closed"}
          submitting={isSubmitting}
        />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{ disabled?: boolean; submitting?: boolean }> = ({
  disabled,
  submitting,
}) => {
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isDisabled = disabled || submitting || isEmpty;
  const showCancel = isRunning && isEmpty && !disabled;

  return (
    <div className="aui-composer-action-wrapper relative mx-2 mb-2 flex items-center justify-between">
      <ComposerAddAttachment />
      {!showCancel ? (
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
      ) : (
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
      )}
    </div>
  );
};
