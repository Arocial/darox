"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUpIcon, ChevronDownIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isDesktop } from "@/components/darox-ui/backend-store";

export function FindBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    active: number;
    total: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const find = useCallback(
    (text: string, opts?: { forward?: boolean; findNext?: boolean }) => {
      const api = typeof window !== "undefined" ? window.darox : undefined;
      if (!api) return;
      if (!text) {
        api.stopFindInPage("clearSelection");
        setResult(null);
        return;
      }
      api.findInPage({ text, ...opts });
    },
    [],
  );

  const stop = useCallback(() => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    api?.stopFindInPage("clearSelection");
    setResult(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    stop();
  }, [stop]);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.darox : undefined;
    if (!api) return;
    return api.onFoundInPage((r) => {
      setResult({ active: r.activeMatchOrdinal, total: r.matches });
    });
  }, []);

  // Ctrl/Cmd+F opens the bar (desktop only — browsers keep their native find).
  useEffect(() => {
    if (!isDesktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  const onInputChange = (value: string) => {
    setQuery(value);
    find(value, { findNext: false });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      find(query, { findNext: true, forward: !e.shiftKey });
    }
  };

  const hasQuery = query.length > 0;
  const noMatch = hasQuery && result !== null && result.total === 0;

  return (
    <div className="fixed top-2 right-4 z-50 flex items-center gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder="Find"
        className="h-7 w-48 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <span
        className={`min-w-14 px-1 text-center text-xs tabular-nums ${
          noMatch ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {hasQuery ? `${result?.active ?? 0}/${result?.total ?? 0}` : ""}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!hasQuery}
        onClick={() => find(query, { findNext: true, forward: false })}
        aria-label="Previous match"
      >
        <ChevronUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!hasQuery}
        onClick={() => find(query, { findNext: true, forward: true })}
        aria-label="Next match"
      >
        <ChevronDownIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={close} aria-label="Close">
        <XIcon />
      </Button>
    </div>
  );
}
