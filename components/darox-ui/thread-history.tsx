"use client";

import { ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  createContext,
  type ComponentType,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CommandInputList } from "./command-input-list";
import { CompactionMarkerList } from "./compaction-marker-list";
import {
  buildHistorySections,
  buildInputIndex,
  initialHistoryCount,
  type ThreadInput,
} from "./thread-history-model";
import { ThreadInputNavigator } from "./thread-input-navigator";

type HistoryState = {
  inputs: ThreadInput[];
  messageIds: string[];
  sections: ReturnType<typeof buildHistorySections>;
  expanded: Set<string>;
  toggle: (id: string) => void;
  viewport: RefObject<HTMLDivElement>;
};

const HistoryContext = createContext<HistoryState | null>(null);

export function ThreadHistory({
  children,
}: {
  children: (props: {
    viewport: RefObject<HTMLDivElement>;
    readingHistory: boolean;
    onScroll: () => void;
    navigator: ReactNode;
  }) => ReactNode;
}) {
  // Only input/layout changes invalidate history UI, not streamed assistant parts.
  const serializedInputs = useAuiState((s) =>
    JSON.stringify(buildInputIndex(s.thread.messages)),
  );
  const serializedIds = useAuiState((s) =>
    JSON.stringify(s.thread.messages.map((message) => message.id)),
  );
  const inputs = useMemo(
    () => JSON.parse(serializedInputs) as ThreadInput[],
    [serializedInputs],
  );
  const messageIds = useMemo(
    () => JSON.parse(serializedIds) as string[],
    [serializedIds],
  );
  const [historicalCount, setHistoricalCount] = useState(() =>
    initialHistoryCount(inputs.length),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [readingHistory, setReadingHistory] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  const sections = useMemo(
    () => buildHistorySections(inputs, historicalCount),
    [inputs, historicalCount],
  );

  useEffect(() => {
    if (
      readingHistory ||
      historicalCount !== 0 ||
      initialHistoryCount(inputs.length) === 0
    )
      return;
    if (
      viewport.current?.querySelector('[data-slot="aui_edit-composer-wrapper"]')
    )
      return;
    setHistoricalCount(initialHistoryCount(inputs.length));
  }, [inputs.length, historicalCount, readingHistory]);

  const toggle = useCallback((id: string) => {
    const root = viewport.current;
    const header = root?.querySelector<HTMLElement>(
      `[data-history-section="${CSS.escape(id)}"]`,
    );
    if (header?.querySelector('[data-slot="aui_edit-composer-wrapper"]'))
      return;
    if (header)
      anchor.current = {
        element: header,
        top: header.getBoundingClientRect().top,
      };
    setReadingHistory(true);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!anchor.current || !viewport.current) return;
    const { element, top } = anchor.current;
    viewport.current.scrollTop += element.getBoundingClientRect().top - top;
    anchor.current = null;
  }, [expanded]);

  const navigate = useCallback(
    (input: ThreadInput) => {
      setReadingHistory(true);
      setTarget(input.id);
      const section = sections.find(
        (item) =>
          input.messageIndex >= item.start && input.messageIndex < item.end,
      );
      if (section) setExpanded((current) => new Set(current).add(section.id));
    },
    [sections],
  );

  useEffect(() => {
    if (!target) return;
    let highlight: Animation | undefined;
    let completionTimer: number | undefined;
    const timer = window.setTimeout(() => {
      const root = viewport.current;
      const element = root?.querySelector<HTMLElement>(
        `[data-thread-input="${CSS.escape(target)}"]`,
      );
      if (!root || !element) {
        setTarget(null);
        return;
      }
      const top =
        element.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop -
        16;
      root.scrollTo({ top, behavior: "instant" });
      element.focus({ preventScroll: true });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        highlight = element.animate(
          [
            { backgroundColor: "var(--color-accent)" },
            { backgroundColor: "transparent" },
          ],
          { duration: 1400 },
        );
      }
      setActiveId(target);
      completionTimer = window.setTimeout(() => setTarget(null), 1400);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(completionTimer);
      highlight?.cancel();
    };
  }, [target]);

  const onScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const root = viewport.current;
      if (!root || root.clientHeight === 0) return;
      if (!target)
        setReadingHistory(
          root.scrollHeight - root.scrollTop - root.clientHeight >= 4,
        );
      const top = root.getBoundingClientRect().top + 32;
      let current: string | null = null;
      for (const element of Array.from(
        root.querySelectorAll<HTMLElement>("[data-thread-input]"),
      )) {
        if (element.getBoundingClientRect().top > top) break;
        current = element.dataset.threadInput ?? null;
      }
      setActiveId(current);
    });
  }, [target]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <HistoryContext.Provider
      value={{ inputs, messageIds, sections, expanded, toggle, viewport }}
    >
      {children({
        viewport,
        readingHistory,
        onScroll,
        navigator: (
          <ThreadInputNavigator
            inputs={inputs}
            activeId={activeId}
            onNavigate={navigate}
          />
        ),
      })}
    </HistoryContext.Provider>
  );
}

export function ThreadHistoryMessages({ Message }: { Message: ComponentType }) {
  const history = useContext(HistoryContext);
  if (!history) throw new Error("ThreadHistoryMessages requires ThreadHistory");
  const { inputs, messageIds, sections, expanded, toggle } = history;
  const inputByIndex = new Map(
    inputs.map((input) => [input.messageIndex, input]),
  );
  const components = useMemo(() => ({ Message }), [Message]);
  const renderRange = (start: number, end: number) =>
    messageIds.slice(start, end).map((id, offset) => {
      const index = start + offset;
      const input = inputByIndex.get(index);
      return (
        <div
          key={id}
          data-thread-input={input?.id}
          tabIndex={input ? -1 : undefined}
          className="flex min-w-0 flex-col gap-y-6 rounded-lg outline-none"
        >
          <CompactionMarkerList beforeMessageIndex={index} />
          <CommandInputList beforeMessageIndex={index} />
          <ThreadPrimitive.MessageByIndex
            index={index}
            components={components}
          />
        </div>
      );
    });

  return (
    <>
      {sections.map((section) => {
        const open = expanded.has(section.id);
        return (
          <section
            key={section.id}
            data-history-section={section.id}
            className="flex min-w-0 flex-col gap-y-6"
          >
            <button
              type="button"
              aria-expanded={open}
              className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-left text-muted-foreground text-sm hover:bg-muted/60"
              onClick={() => toggle(section.id)}
            >
              {open ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
              Earlier conversation · Inputs {section.firstInput}–
              {section.lastInput}
            </button>
            {open && renderRange(section.start, section.end)}
          </section>
        );
      })}
      {renderRange(sections.at(-1)?.end ?? 0, messageIds.length)}
    </>
  );
}
