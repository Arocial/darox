"use client";

import { Command } from "cmdk";
import { FC, useState, useEffect, useRef } from "react";
import { ComposerPrimitive, useAuiState, useAui } from "@assistant-ui/react";

export const ComposerWithCommandMenu: FC = () => {
  const text = useAuiState((s) => s.composer.text);
  const aui = useAui();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [command, setCommand] = useState<string | null>(null);
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

  const handleSelect = (val: string) => {
    justSelected.current = true;
    if (!command) {
      aui.composer().setText(`/${val} `);
    } else {
      aui.composer().setText(`${command} ${val} `);
      setOpen(false);
    }
  };

  const groupClassName = "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
            {!command ? (
              <Command.Group heading="Commands" className={groupClassName}>
                {["add", "remove", "help"].filter(c => c.includes(search)).map(c => (
                  <Command.Item
                    key={c}
                    value={c}
                    onSelect={() => handleSelect(c)}
                    className="px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    /{c}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : command === "/add" ? (
              <Command.Group heading="Files" className={groupClassName}>
                {["src/main.ts", "src/utils.ts", "package.json", "README.md"].filter(f => f.includes(search)).map(f => (
                  <Command.Item
                    key={f}
                    value={f}
                    onSelect={() => handleSelect(f)}
                    className="px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    {f}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </div>
      )}
      <Command.Input asChild value={text} onValueChange={(v) => aui.composer().setText(v)}>
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
          rows={1}
          autoFocus
          aria-label="Message input"
          submitMode={open ? "none" : "enter"}
        />
      </Command.Input>
    </Command>
  );
};
