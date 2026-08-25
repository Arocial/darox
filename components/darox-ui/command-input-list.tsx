"use client";

import { CheckCircle2Icon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import { useCommandInputs } from "@/components/darox-ui/command-input-context";

function commandLabel(command: unknown): string {
  if (typeof command === "string") return command;
  if (command && typeof command === "object" && "type" in command) {
    const type = (command as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return JSON.stringify(command);
}

export function CommandInputList({
  beforeMessageIndex,
}: {
  beforeMessageIndex: number;
}) {
  const commands = useCommandInputs().filter(
    (item) => item.beforeMessageIndex === beforeMessageIndex,
  );

  return commands.map((item) => {
    const pending = item.status === "accepted";
    const failed = item.status !== "handled" && !pending;
    return (
      <div
        key={item.clientMessageId}
        className="rounded-lg border border-border bg-muted/35 px-3 py-2 font-mono text-foreground text-sm"
        data-slot="command-input"
      >
        <div className="flex items-center gap-2">
          {pending ? (
            <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
          ) : failed ? (
            <CircleXIcon className="size-3.5 text-destructive" />
          ) : (
            <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span className="min-w-0 flex-1 truncate">
            $ {commandLabel(item.command)}
          </span>
          <span className="text-muted-foreground text-xs">{item.status}</span>
        </div>
        {(item.output || item.error) && (
          <pre
            className={`mt-2 overflow-x-auto whitespace-pre-wrap border-t pt-2 text-xs ${item.error ? "text-destructive" : "text-muted-foreground"}`}
          >
            {item.error ?? item.output}
          </pre>
        )}
      </div>
    );
  });
}
