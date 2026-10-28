"use client";

import { ListIcon, SearchIcon } from "lucide-react";
import { memo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ThreadInput } from "./thread-history-model";

type Props = {
  inputs: readonly ThreadInput[];
  activeId: string | null;
  onNavigate: (input: ThreadInput) => void;
};

export const ThreadInputNavigator = memo(function ThreadInputNavigator({
  inputs,
  activeId,
  onNavigate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigating = useRef(false);
  if (inputs.length < 2) return null;
  const filtered = inputs.filter((input) =>
    `${input.ordinal} ${input.text}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );

  return (
    <div className="absolute top-14 right-2 z-30 md:top-16 md:right-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Open conversation inputs"
            title="Conversation inputs"
            className="flex size-9 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
          >
            <ListIcon className="size-4" />
          </button>
        </DialogTrigger>
        <DialogContent
          onCloseAutoFocus={(event) => {
            if (navigating.current) event.preventDefault();
            navigating.current = false;
          }}
          className="top-auto right-0 bottom-0 left-auto flex max-h-[80dvh] w-full translate-x-0 translate-y-0 flex-col gap-3 rounded-b-none sm:top-28 sm:right-5 sm:bottom-auto sm:max-h-[70dvh] sm:max-w-sm sm:rounded-xl"
        >
          <DialogHeader>
            <DialogTitle>Conversation inputs</DialogTitle>
            <DialogDescription>
              Jump to any input, including folded history.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              aria-label="Search conversation inputs"
              placeholder="Search inputs…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav
            aria-label="Conversation inputs"
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            {filtered.map((input) => (
              <button
                type="button"
                key={input.id}
                title={input.text}
                aria-current={activeId === input.id ? "location" : undefined}
                className="mb-1 flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent aria-[current=location]:bg-accent"
                onClick={() => {
                  navigating.current = true;
                  setOpen(false);
                  onNavigate(input);
                }}
              >
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {input.ordinal.toString().padStart(2, "0")}
                </span>
                <span className="line-clamp-2 min-w-0 whitespace-pre-wrap break-words">
                  {input.text}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-3 text-muted-foreground text-sm">
                No matching inputs.
              </p>
            )}
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
});
