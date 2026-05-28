"use client";

import { useState, useEffect, useMemo } from "react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import {
  ChatInputContext,
  defaultInputArgs,
} from "@/components/darox-ui/chat-input-context";
import { AgentIdContext } from "@/components/darox-ui/agent-id-context";
import { AgentNameContext } from "@/components/darox-ui/agent-name-context";
import { WorkspaceContext } from "@/components/darox-ui/workspace-context";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import {
  acquireTransport,
  releaseTransport,
  httpBaseToWsUrl,
} from "@/components/darox-ui/websocket-chat-transport";
import { ModelPill } from "@/components/darox-ui/model-pill";
import { UserTurnAnchorsContext } from "@/components/darox-ui/user-turn-anchors-context";
import { sendAgentCommand } from "@/components/darox-ui/agent-command";
import type { ChatInputEventArgs } from "@/app/page";
import type { UIMessage } from "ai";

function AgentChat({
  agentId,
  agentName,
  mainAgent,
  workspace,
  initialMessages,
  initialAnchors,
}: {
  agentId: string;
  agentName: string;
  mainAgent: string;
  workspace: string;
  initialMessages: UIMessage[];
  initialAnchors: Record<string, string>;
}) {
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);
  const [anchors, setAnchors] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialAnchors)),
  );
  const apiBase = useBackendStore((s) => s.apiBase);

  const url = useMemo(
    () => httpBaseToWsUrl(apiBase, agentId, agentName),
    [apiBase, agentId, agentName],
  );
  const transport = useMemo(() => acquireTransport(url), [url]);

  useEffect(() => {
    transport.onEvent = (dataPart) => {
      if (dataPart.type === "data-input-request") {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      } else if (dataPart.type === "data-user-turn") {
        const { eventId, messageId } = dataPart as {
          eventId?: string;
          messageId?: string;
        };
        if (typeof eventId === "string" && typeof messageId === "string") {
          setAnchors((prev) => {
            if (prev.get(messageId) === eventId) return prev;
            const next = new Map(prev);
            next.set(messageId, eventId);
            return next;
          });
        }
      }
    };

    return () => {
      transport.onEvent = undefined;
      releaseTransport(url);
    };
  }, [transport, url]);

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages,
    // resume: true triggers transport.reconnectToStream() on mount so we
    // start draining server-pushed events before the user submits anything.
    resume: true,
    onData: (dataPart) => {
      if (dataPart.type === "data-input-request") {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      } else if (dataPart.type === "data-user-turn") {
        const { eventId, messageId } = dataPart as {
          eventId?: string;
          messageId?: string;
        };
        if (typeof eventId === "string" && typeof messageId === "string") {
          setAnchors((prev) => {
            if (prev.get(messageId) === eventId) return prev;
            const next = new Map(prev);
            next.set(messageId, eventId);
            return next;
          });
        }
      }
    },
  } as Parameters<typeof useChatRuntime>[0]);

  const anchorsValue = useMemo(
    () => ({
      anchors,
      forkAt: (eventId: string) =>
        sendAgentCommand(apiBase, agentId, mainAgent, {
          type: "ForkEvent",
          event_id: eventId,
        }),
    }),
    [anchors, apiBase, agentId, mainAgent],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      <AgentIdContext.Provider value={agentId}>
        <AgentNameContext.Provider value={agentName}>
          <ChatInputContext.Provider value={{ inputArgs, setInputArgs }}>
            <UserTurnAnchorsContext.Provider value={anchorsValue}>
              <AssistantRuntimeProvider runtime={runtime}>
                <div className="h-full">
                  <Thread />
                </div>
              </AssistantRuntimeProvider>
            </UserTurnAnchorsContext.Provider>
          </ChatInputContext.Provider>
        </AgentNameContext.Provider>
      </AgentIdContext.Provider>
    </WorkspaceContext.Provider>
  );
}

function AgentChatLoader({
  agentId,
  agentName,
  mainAgent,
  workspace,
}: {
  agentId: string;
  agentName: string;
  mainAgent: string;
  workspace: string;
}) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );
  const [initialAnchors, setInitialAnchors] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    const apiBase = useBackendStore.getState().apiBase;
    fetch(`${apiBase}/api/agents/${agentId}/${agentName}/state`)
      .then((res) => res.json())
      .then((data) => {
        const history: UIMessage[] = Array.isArray(data.history)
          ? data.history
          : [];
        setInitialMessages(history);
        // Pair the backend's ordered user-turn event ids with our own user
        // messages by position to rebuild the message-id -> event-id map.
        const turns: string[] = Array.isArray(data.user_turns)
          ? data.user_turns
          : [];
        const userMsgs = history.filter((m) => m.role === "user");
        const anchors: Record<string, string> = {};
        const n = Math.min(userMsgs.length, turns.length);
        for (let k = 0; k < n; k++) {
          anchors[userMsgs[k].id] = turns[k];
        }
        setInitialAnchors(anchors);
      })
      .catch((err) => {
        console.error("Failed to fetch history", err);
        setInitialMessages([]);
      });
  }, [agentId, agentName]);

  if (initialMessages === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading history...
      </div>
    );
  }

  return (
    <AgentChat
      agentId={agentId}
      agentName={agentName}
      mainAgent={mainAgent}
      workspace={workspace}
      initialMessages={initialMessages}
      initialAnchors={initialAnchors}
    />
  );
}

export function AgentTabPanel({
  agentId,
  workspace,
  mainAgent,
  subagents,
}: {
  agentId: string;
  workspace: string;
  mainAgent: string;
  subagents: string[];
}) {
  const agents = useMemo(
    () => [mainAgent, ...subagents],
    [mainAgent, subagents],
  );
  const [activeAgent, setActiveAgent] = useState(mainAgent);
  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set([mainAgent]),
  );

  const handleSelect = (name: string) => {
    setActiveAgent(name);
    if (!mounted.has(name)) {
      setMounted((prev) => {
        const next = new Set(prev);
        next.add(name);
        return next;
      });
    }
  };

  return (
    <div className="relative h-full">
      {Array.from(mounted).map((name) => (
        <div
          key={name}
          className={`absolute inset-0 ${
            activeAgent === name ? "visible z-10" : "invisible z-0"
          }`}
        >
          <AgentChatLoader
            agentId={agentId}
            agentName={name}
            mainAgent={mainAgent}
            workspace={workspace}
          />
        </div>
      ))}
      <div className="absolute top-3 left-3 z-20">
        <ModelPill agentId={agentId} agentName={activeAgent} />
      </div>
      {agents.length > 1 && (
        <div className="absolute top-3 right-3 z-20 flex min-w-32 max-w-48 flex-col rounded-lg border bg-popover/95 py-1 shadow-md backdrop-blur-sm">
          <div className="mb-2 rounded-t-md border-border border-b bg-muted/60 px-3 py-1.5 font-semibold text-foreground/80 text-xs uppercase tracking-wider">
            Agents
          </div>
          {agents.map((name) => (
            <button
              key={name}
              onClick={() => handleSelect(name)}
              className={`mx-1 flex items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                activeAgent === name
                  ? "bg-accent font-semibold text-foreground"
                  : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
              }`}
              title={name === mainAgent ? `${name} (main)` : name}
            >
              <span className="flex-1 truncate">{name}</span>
              {name === mainAgent && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  main
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
