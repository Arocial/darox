"use client";

import { Command } from "cmdk";
import {
  type FC,
  useState,
  useEffect,
  useRef,
  useContext,
  useMemo,
} from "react";
import { ComposerPrimitive, useAuiState, useAui } from "@assistant-ui/react";
import { AgentIdContext } from "@/components/darox-ui/agent-id-context";
import { AgentNameContext } from "@/components/darox-ui/agent-name-context";
import {
  useWorkspace,
  historyKey,
} from "@/components/darox-ui/workspace-context";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import type { SuggestionItem } from "@/types/chat";

function useCommandHistory(workspace: string, text: string) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const key = historyKey(workspace);
    const loadHistory = () => {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setHistory(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse history", e);
        }
      } else {
        setHistory([]);
      }
    };
    loadHistory();
    window.addEventListener("cmd_history_updated", loadHistory);
    return () => window.removeEventListener("cmd_history_updated", loadHistory);
  }, [workspace]);

  const historySuggestions = useMemo(() => {
    return history
      .filter((h) => h.toLowerCase().includes(text.toLowerCase()) && h !== text)
      .map((h) => ({
        id: `history-${h}`,
        value: h,
        label: h,
        description: "History",
        source: "history" as const,
      }));
  }, [history, text]);

  return historySuggestions;
}

function useSuggestions(
  command: string | null,
  search: string,
  open: boolean,
  agentId: string | null,
  agentName: string | null,
  apiBase: string,
) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const base =
          agentId && agentName
            ? `${apiBase}/api/agents/${agentId}/${agentName}/suggestions`
            : `${apiBase}/api/suggestions`;
        const url = new URL(base);
        if (command) {
          url.searchParams.set("command", command.slice(1));
          const words = search.split(" ");
          const lastWord = words[words.length - 1];
          if (lastWord) {
            url.searchParams.set("q", lastWord);
          }
        } else {
          if (search) {
            url.searchParams.set("q", search);
          }
        }

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          setSuggestions(items);
        } else {
          setSuggestions([]);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        console.error("Failed to fetch suggestions", e);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 150);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [command, search, open, agentId, agentName, apiBase]);

  return { suggestions, loading };
}

const SuggestionItemRenderer: FC<{
  item: SuggestionItem;
  onSelect: (item: SuggestionItem) => void;
}> = ({ item, onSelect }) => (
  <Command.Item
    value={item.id}
    onSelect={() => onSelect(item)}
    className="flex w-full cursor-pointer flex-col items-start overflow-hidden rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
  >
    <span className="w-full truncate text-left">{item.label}</span>
    {item.description && (
      <span className="mt-0.5 w-full truncate text-left text-muted-foreground text-xs">
        {item.description}
      </span>
    )}
  </Command.Item>
);

export const ComposerWithCommandMenu: FC<{ disabled?: boolean }> = ({
  disabled,
}) => {
  const agentId = useContext(AgentIdContext);
  const agentName = useContext(AgentNameContext);
  const workspace = useWorkspace();
  const apiBase = useBackendStore((s) => s.apiBase);
  const text = useAuiState((s) => s.composer.text);
  const aui = useAui();

  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
  const justSelected = useRef(false);

  // Derive command/search synchronously from text
  const { command, search } = useMemo(() => {
    if (text.startsWith("/")) {
      const parts = text.split(" ");
      if (parts.length > 1) {
        return { command: parts[0], search: parts.slice(1).join(" ") };
      }
      return { command: null, search: text.slice(1) };
    }
    return { command: null, search: text };
  }, [text]);

  const historySuggestions = useCommandHistory(workspace, text);

  // Decide whether the menu should be open based on text
  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      setOpen(false);
    } else if (text.length === 0) {
      setOpen(false);
    } else {
      setOpen(true);
    }
  }, [text]);

  const { suggestions, loading } = useSuggestions(
    command,
    search,
    open,
    agentId,
    agentName,
    apiBase,
  );

  useEffect(() => {
    if (historySuggestions.length > 0) {
      setSelectedValue(historySuggestions[0].id);
    } else if (suggestions.length > 0) {
      setSelectedValue(suggestions[0].id);
    }
  }, [suggestions, historySuggestions]);

  const handleSelect = (item: SuggestionItem) => {
    justSelected.current = true;
    if (item.source === "history") {
      aui.composer().setText(item.value);
      setOpen(false);
      return;
    }
    const val = item.value;
    const parts = text.split(" ");
    parts.pop();
    if (parts.length === 0) {
      aui.composer().setText(`${val} `);
    } else {
      aui.composer().setText(`${parts.join(" ")} ${val} `);
    }
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab" || e.key === "ArrowRight") {
      const isArrowRight = e.key === "ArrowRight";
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;

      if (isArrowRight) {
        if (
          !target ||
          typeof target.selectionStart !== "number" ||
          target.selectionStart !== target.value.length
        ) {
          return;
        }
      }

      e.preventDefault();
      const selectedEl = document.querySelector(
        '[cmdk-item][aria-selected="true"]',
      ) as HTMLElement;
      if (selectedEl) {
        selectedEl.click();
      }
    }
  };

  const showMenu =
    open &&
    isFocused &&
    (historySuggestions.length > 0 || suggestions.length > 0);

  const groupClassName =
    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

  return (
    <Command
      className="relative flex w-full flex-col"
      shouldFilter={false}
      onKeyDown={handleKeyDown}
      value={selectedValue}
      onValueChange={setSelectedValue}
    >
      {showMenu && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Command.List className="max-h-[300px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-muted-foreground text-sm">
              {loading ? "Loading..." : "No results found."}
            </Command.Empty>
            {historySuggestions.length > 0 && (
              <Command.Group heading="History" className={groupClassName}>
                {historySuggestions.map((item) => (
                  <SuggestionItemRenderer
                    key={item.id}
                    item={item}
                    onSelect={handleSelect}
                  />
                ))}
              </Command.Group>
            )}
            {suggestions.length > 0 && (
              <Command.Group
                heading={!command ? "Commands" : "Suggestions"}
                className={groupClassName}
              >
                {suggestions.map((item) => (
                  <SuggestionItemRenderer
                    key={item.id}
                    item={item}
                    onSelect={handleSelect}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </div>
      )}
      <ComposerPrimitive.Input
        disabled={disabled}
        placeholder="Send a message (Shift+Enter or Alt+Enter to insert newline)..."
        className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
        rows={1}
        autoFocus
        aria-label="Message input"
        submitMode={showMenu ? "none" : "enter"}
        onFocus={() => {
          setIsFocused(true);
          if (text.length > 0) setOpen(true);
        }}
        onBlur={() => setIsFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.altKey) {
            e.preventDefault();
            const target = e.currentTarget as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const value = target.value;
            const newValue = `${value.substring(0, start)}\n${value.substring(end)}`;
            aui.composer().setText(newValue);
            requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = start + 1;
            });
            return;
          }

          const isModifier = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
          const cmdkKeys = [
            "Enter",
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
            "Escape",
          ];

          if (!showMenu) {
            if (cmdkKeys.includes(e.key)) e.stopPropagation();
          } else {
            if (isModifier && cmdkKeys.includes(e.key)) {
              e.stopPropagation();
            }
          }
        }}
      />
    </Command>
  );
};
