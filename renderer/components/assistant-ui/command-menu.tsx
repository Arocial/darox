"use client";

import { Command } from "cmdk";
import { FC, useState, useEffect, useRef } from "react";
import { ComposerPrimitive, useAuiState, useAui } from "@assistant-ui/react";

type SuggestionItem = {
  id: string;
  value: string;
  label: string;
  description: string | null;
};

export const ComposerWithCommandMenu: FC = () => {
  const text = useAuiState((s) => s.composer.text);
  const aui = useAui();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [command, setCommand] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const justSelected = useRef(false);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      if (text.startsWith("/")) {
        const parts = text.split(" ");
        if (parts.length > 1) {
          setCommand(parts[0]);
          setSearch(parts.slice(1).join(" "));
        } else {
          setCommand(null);
          setSearch(text.slice(1));
        }
      } else {
        setOpen(false);
      }
      return;
    }

    if (text.startsWith("/")) {
      setOpen(true);
      const parts = text.split(" ");
      if (parts.length > 1) {
        setCommand(parts[0]);
        setSearch(parts.slice(1).join(" "));
      } else {
        setCommand(null);
        setSearch(text.slice(1));
      }
    } else {
      setOpen(false);
    }
  }, [text]);

  useEffect(() => {
    if (!open) return;

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const url = new URL("http://localhost:8000/api/suggestions");
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
        
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          setSuggestions(items);
          if (items.length === 0) {
            setOpen(false);
          }
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } catch (e) {
        console.error("Failed to fetch suggestions", e);
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 150);
    return () => clearTimeout(debounce);
  }, [command, search, open]);

  const handleSelect = (val: string) => {
    justSelected.current = true;
    const parts = text.split(" ");
    parts.pop();
    if (parts.length === 0) {
      aui.composer().setText(`${val} `);
    } else {
      aui.composer().setText(`${parts.join(" ")} ${val} `);
      setOpen(false);
    }
  };

  const groupClassName = "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const selectedEl = document.querySelector('[cmdk-item][aria-selected="true"]') as HTMLElement;
      if (selectedEl) {
        selectedEl.click();
      }
    } else if (e.key === "ArrowRight") {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target && typeof target.selectionStart === "number" && target.selectionStart === target.value.length) {
        e.preventDefault();
        const selectedEl = document.querySelector('[cmdk-item][aria-selected="true"]') as HTMLElement;
        if (selectedEl) {
          selectedEl.click();
        }
      }
    }
  };

  return (
    <Command 
      className="relative w-full flex flex-col" 
      shouldFilter={false}
      onKeyDown={handleKeyDown}
    >
      {open && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-popover text-popover-foreground border rounded-md shadow-md z-50 overflow-hidden">
          <Command.List className="max-h-[300px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No results found."}
            </Command.Empty>
            {suggestions.length > 0 && (
              <Command.Group heading={!command ? "Commands" : "Suggestions"} className={groupClassName}>
                {suggestions.map(item => (
                  <Command.Item
                    key={item.id}
                    value={item.value}
                    onSelect={() => handleSelect(item.value)}
                    className="px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground flex flex-col items-start"
                  >
                    <span>{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground mt-0.5">{item.description}</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </div>
      )}
      <ComposerPrimitive.Input
        placeholder="Send a message..."
        className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
        rows={1}
        autoFocus
        aria-label="Message input"
        submitMode={open ? "none" : "enter"}
      />
    </Command>
  );
};
