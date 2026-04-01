'use client';

import { Command } from 'cmdk';
import { FC, useState, useEffect, useRef, useContext } from 'react';
import { ComposerPrimitive, useAuiState, useAui } from '@assistant-ui/react';
import { ComposerIdContext } from '@/components/darox-ui/composer-id-context';
import { useWorkspace, historyKey } from '@/components/darox-ui/workspace-context';

type SuggestionItem = {
  id: string;
  value: string;
  label: string;
  description: string | null;
  source?: 'history' | 'dynamic';
};

export const ComposerWithCommandMenu: FC<{ disabled?: boolean }> = ({ disabled }) => {
  const composerId = useContext(ComposerIdContext);
  const workspace = useWorkspace();
  const text = useAuiState((s) => s.composer.text);
  const aui = useAui();
  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [search, setSearch] = useState('');
  const [command, setCommand] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [historySuggestions, setHistorySuggestions] = useState<SuggestionItem[]>(
    [],
  );
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedValue, setSelectedValue] = useState('');
  const justSelected = useRef(false);

  useEffect(() => {
    const key = historyKey(workspace);
    const loadHistory = () => {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setHistory(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse history', e);
        }
      } else {
        setHistory([]);
      }
    };
    loadHistory();
    window.addEventListener('cmd_history_updated', loadHistory);
    return () => window.removeEventListener('cmd_history_updated', loadHistory);
  }, [workspace]);

  useEffect(() => {
    if (historySuggestions.length > 0) {
      setSelectedValue(historySuggestions[0].id);
    } else if (suggestions.length > 0) {
      setSelectedValue(suggestions[0].id);
    }
  }, [suggestions, historySuggestions]);

  useEffect(() => {
    let currentCommand = null;
    let currentSearch = text;

    if (text.startsWith('/')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        currentCommand = parts[0];
        currentSearch = parts.slice(1).join(' ');
      } else {
        currentCommand = null;
        currentSearch = text.slice(1);
      }
    } else {
      currentCommand = null;
      currentSearch = text;
    }

    setCommand(currentCommand);
    setSearch(currentSearch);

    // Filter history
    const matchedHistory = history
      .filter((h) => h.toLowerCase().includes(text.toLowerCase()) && h !== text)
      .map((h) => ({
        id: `history-${h}`,
        value: h,
        label: h,
        description: 'History',
        source: 'history' as const,
      }));
    setHistorySuggestions(matchedHistory);

    if (justSelected.current) {
      justSelected.current = false;
      setOpen(false);
    } else {
      setOpen(true);
    }
  }, [text, history]);

  useEffect(() => {
    if (!open) return;

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const base = composerId
          ? `http://localhost:8000/api/composers/${composerId}/suggestions`
          : 'http://localhost:8000/api/suggestions';
        const url = new URL(base);
        if (command) {
          url.searchParams.set('command', command.slice(1));
          const words = search.split(' ');
          const lastWord = words[words.length - 1];
          if (lastWord) {
            url.searchParams.set('q', lastWord);
          }
        } else {
          if (search) {
            url.searchParams.set('q', search);
          }
        }

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          setSuggestions(items);
        } else {
          setSuggestions([]);
        }
      } catch (e) {
        console.error('Failed to fetch suggestions', e);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 150);
    return () => clearTimeout(debounce);
  }, [command, search, open, composerId]);

  const handleSelect = (item: SuggestionItem) => {
    justSelected.current = true;
    if (item.source === 'history') {
      aui.composer().setText(item.value);
      setOpen(false);
      return;
    }
    const val = item.value;
    const parts = text.split(' ');
    parts.pop();
    if (parts.length === 0) {
      aui.composer().setText(`${val} `);
    } else {
      aui.composer().setText(`${parts.join(' ')} ${val} `);
    }
    setOpen(false);
  };

  const groupClassName =
    '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (!open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const selectedEl = document.querySelector(
        '[cmdk-item][aria-selected="true"]',
      ) as HTMLElement;
      if (selectedEl) {
        selectedEl.click();
      }
    } else if (e.key === 'ArrowRight') {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        target &&
        typeof target.selectionStart === 'number' &&
        target.selectionStart === target.value.length
      ) {
        e.preventDefault();
        const selectedEl = document.querySelector(
          '[cmdk-item][aria-selected="true"]',
        ) as HTMLElement;
        if (selectedEl) {
          selectedEl.click();
        }
      }
    }
  };

  const showMenu = open && isFocused && (historySuggestions.length > 0 || suggestions.length > 0);

  return (
    <Command
      className="relative w-full flex flex-col"
      shouldFilter={false}
      onKeyDown={handleKeyDown}
      value={selectedValue}
      onValueChange={setSelectedValue}
    >
      {showMenu && (
        <div 
          className="absolute bottom-full left-0 w-full mb-2 bg-popover text-popover-foreground border rounded-md shadow-md z-50 overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Command.List className="max-h-[300px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {loading ? 'Loading...' : 'No results found.'}
            </Command.Empty>
            {historySuggestions.length > 0 && (
              <Command.Group heading="History" className={groupClassName}>
                {historySuggestions.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item)}
                    className="px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground flex flex-col items-start"
                  >
                    <span>{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {item.description}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {suggestions.length > 0 && (
              <Command.Group
                heading={!command ? 'Commands' : 'Suggestions'}
                className={groupClassName}
              >
                {suggestions.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item)}
                    className="px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground flex flex-col items-start"
                  >
                    <span>{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {item.description}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </div>
      )}
      <ComposerPrimitive.Input
        disabled={disabled}
        placeholder="Send a message (Shift+Enter to insert newline)..."
        className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
        rows={1}
        autoFocus
        aria-label="Message input"
        submitMode={showMenu ? 'none' : 'enter'}
        onFocus={() => {
          setIsFocused(true);
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 200);
        }}
        onKeyDown={(e) => {
          const isModifier = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
          if (!showMenu) {
            // Prevent cmdk from intercepting keys when the menu is closed,
            // allowing normal textarea behavior (e.g., multi-line input, cursor movement).
            const cmdkKeys = [
              'Enter',
              'ArrowUp',
              'ArrowDown',
              'PageUp',
              'PageDown',
              'Home',
              'End',
              'Escape',
            ];
            if (cmdkKeys.includes(e.key)) {
              e.stopPropagation();
            }
          } else {
            // When open, allow cmdk to handle Enter to select an item,
            // but prevent it if a modifier key is pressed (to allow newlines).
            if (
              isModifier &&
              [
                'Enter',
                'ArrowUp',
                'ArrowDown',
                'PageUp',
                'PageDown',
                'Home',
                'End',
              ].includes(e.key)
            ) {
              e.stopPropagation();
            }
          }
        }}
      />
    </Command>
  );
};
