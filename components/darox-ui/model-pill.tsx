"use client";
import { daroxFetch } from "@/lib/api";

import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { ChevronDownIcon, CheckIcon } from "lucide-react";

import { useBackendStore } from "@/components/darox-ui/backend-store";
import {
  acquireTransport,
  releaseTransport,
  httpBaseToWsUrl,
} from "@/components/darox-ui/websocket-chat-transport";

import type { SuggestionItem } from "@/types/chat";
export const ModelPill: FC<{ agentId: string; subagentId: string }> = ({
  agentId,
  subagentId,
}) => {
  const apiBase = useBackendStore((s) => s.apiBase);

  const [model, setModel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const wsUrl = useMemo(
    () => httpBaseToWsUrl(apiBase, agentId, subagentId),
    [apiBase, agentId, subagentId],
  );

  // Fetch initial model from /state.
  useEffect(() => {
    let cancelled = false;
    daroxFetch(`${apiBase}/api/agents/${agentId}/${subagentId}/state`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && typeof data?.model === "string") {
          setModel(data.model);
        }
      })
      .catch(() => {
        // Non-fatal: just leave model unknown.
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, agentId, subagentId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Fetch suggestions while open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = new URL(
          `${apiBase}/api/agents/${agentId}/${subagentId}/suggestions`,
        );
        url.searchParams.set("command", "model");
        if (query) url.searchParams.set("q", query);
        const res = await daroxFetch(url.toString());
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setItems(data.items || []);
          } else {
            setItems([]);
          }
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, apiBase, agentId, subagentId]);

  const handleSelect = async (modelRef: string) => {
    if (!modelRef) return;
    const previous = model;
    setOpen(false);
    setQuery("");
    setError(null);
    setModel(modelRef); // optimistic
    const transport = acquireTransport(wsUrl);
    try {
      const ack = await transport.sendCommand({
        type: "SetModelEvent",
        model_ref: modelRef,
      });
      if (ack.status !== "ok") {
        setModel(previous);
        setError(ack.output || `Failed to switch model (${ack.status})`);
      }
    } catch (e) {
      setModel(previous);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      releaseTransport(wsUrl);
    }
  };

  const label = model ?? "Select model";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-2.5 py-0.5 text-foreground/80 text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
        title={error ?? `Current model: ${label}`}
      >
        <span className="max-w-[14rem] truncate">{label}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-72 rounded-md border bg-popover shadow-md">
          <div className="border-border border-b p-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  e.preventDefault();
                  handleSelect(query.trim());
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search or type a model…"
              className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && items.length === 0 && (
              <div className="px-3 py-2 text-muted-foreground text-xs">
                Loading…
              </div>
            )}
            {!loading &&
              query.trim() &&
              !items.some((i) => i.value === query.trim()) && (
                <button
                  type="button"
                  onClick={() => handleSelect(query.trim())}
                  className="mx-1 flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-foreground/80 text-sm transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <span className="flex-1 truncate">
                    Use &ldquo;{query.trim()}&rdquo;
                  </span>
                </button>
              )}
            {!loading && items.length === 0 && !query.trim() && (
              <div className="px-3 py-2 text-muted-foreground text-xs">
                No suggestions
              </div>
            )}
            {items.map((item) => {
              const ref = item.value;
              const isCurrent = ref === model;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(ref)}
                  className={`mx-1 flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                    isCurrent
                      ? "bg-accent text-foreground"
                      : "text-foreground/80 hover:bg-muted/60 hover:text-foreground"
                  }`}
                  title={item.description ?? undefined}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  {isCurrent && <CheckIcon className="size-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && (
        <div className="absolute top-full left-0 z-30 mt-8 max-w-xs rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive text-xs">
          {error}
        </div>
      )}
    </div>
  );
};
