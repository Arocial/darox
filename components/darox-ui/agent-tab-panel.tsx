"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import {
  ChatInputContext,
  defaultInputArgs,
} from "@/components/darox-ui/chat-input-context";
import { useAgentTabs } from "@/components/darox-ui/agent-store";
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
import {
  UserTurnAnchorsContext,
  USER_INPUT_ID_KEY,
} from "@/components/darox-ui/user-turn-anchors-context";
import { sendAgentCommand } from "@/components/darox-ui/agent-command";
import type { ChatInputEventArgs } from "@/app/page";
import type { UIMessage } from "ai";

function AgentChat({
  agentId,
  agentName,
  mainAgent,
  workspace,
  initialMessages,
}: {
  agentId: string;
  agentName: string;
  mainAgent: string;
  workspace: string;
  initialMessages: UIMessage[];
}) {
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);
  const apiBase = useBackendStore((s) => s.apiBase);

  const url = useMemo(
    () => httpBaseToWsUrl(apiBase, agentId, agentName),
    [apiBase, agentId, agentName],
  );
  const transport = useMemo(() => acquireTransport(url), [url]);

  const chat = useChat({
    id: `${agentId}:${agentName}`,
    transport,
    messages: initialMessages,
    // resume: true triggers transport.reconnectToStream() on mount so we
    // start draining server-pushed events before the user submits anything.
    resume: true,
    onData: (dataPart) => {
      if (dataPart.type === "data-input-request") {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      }
    },
  });

  const runtime = useAISDKRuntime(chat);

  const setNeedsInput = useAgentTabs((s) => s.setNeedsInput);
  const clearNeedsInput = useAgentTabs((s) => s.clearNeedsInput);
  const setStreaming = useAgentTabs((s) => s.setStreaming);
  const isActive = useAgentTabs((s) => s.activeId === agentId);
  const lastReqIdRef = useRef<string>("");

  useEffect(() => {
    const isBusy = chat.status === "submitted" || chat.status === "streaming";
    setStreaming(agentId, agentName, isBusy);
  }, [chat.status, agentId, agentName, setStreaming]);

  useEffect(() => {
    const needsInput = !!inputArgs.req_id;
    setNeedsInput(agentId, agentName, needsInput);

    if (needsInput && inputArgs.req_id !== lastReqIdRef.current) {
      lastReqIdRef.current = inputArgs.req_id;
      // Send desktop notification
      if (!isActive || !document.hasFocus()) {
        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(`Input required: ${agentName}`, {
              body: `Workspace: ${workspace}`,
            });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((permission) => {
              if (permission === "granted") {
                new Notification(`Input required: ${agentName}`, {
                  body: `Workspace: ${workspace}`,
                });
              }
            });
          }
        }
      }
    } else if (!needsInput) {
      lastReqIdRef.current = "";
    }
  }, [
    inputArgs.req_id,
    agentId,
    agentName,
    setNeedsInput,
    workspace,
    isActive,
  ]);

  useEffect(() => {
    if (!isActive) return;

    const handleInteraction = () => {
      clearNeedsInput(agentId);
    };

    window.addEventListener("focus", handleInteraction);
    return () => {
      window.removeEventListener("focus", handleInteraction);
    };
  }, [isActive, agentId, clearNeedsInput]);

  // Stable handle to setMessages for the transport.onEvent closure below.
  const setMessagesRef = useRef(chat.setMessages);
  setMessagesRef.current = chat.setMessages;

  useEffect(() => {
    transport.onEvent = (dataPart) => {
      if (dataPart.type === "data-input-request") {
        setInputArgs((dataPart as { data: ChatInputEventArgs }).data);
      } else if (dataPart.type === "data-user-turn") {
        const { eventId, messageId } = dataPart as {
          eventId?: string;
          messageId?: string;
        };
        if (typeof eventId !== "string" || typeof messageId !== "string")
          return;
        // Stamp the fork anchor onto the user message's own metadata, in the
        // same place /state delivers it on reload (metadata.custom). No
        // separate message-id -> event-id map to maintain.
        setMessagesRef.current((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const custom = (m.metadata as { custom?: Record<string, unknown> })
              ?.custom;
            if (custom?.[USER_INPUT_ID_KEY] === eventId) return m;
            return {
              ...m,
              metadata: {
                ...(m.metadata as object | undefined),
                custom: { ...custom, [USER_INPUT_ID_KEY]: eventId },
              },
            };
          }),
        );
      }
    };

    return () => {
      transport.onEvent = undefined;
      releaseTransport(url);
    };
  }, [transport, url]);

  const anchorsValue = useMemo(
    () => ({
      forkAt: (eventId: string) =>
        sendAgentCommand(apiBase, agentId, mainAgent, {
          type: "ForkEvent",
          event_id: eventId,
        }),
    }),
    [apiBase, agentId, mainAgent],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      <AgentIdContext.Provider value={agentId}>
        <AgentNameContext.Provider value={agentName}>
          <ChatInputContext.Provider value={{ inputArgs, setInputArgs }}>
            <UserTurnAnchorsContext.Provider value={anchorsValue}>
              <AssistantRuntimeProvider runtime={runtime}>
                <div
                  className="h-full"
                  onMouseDown={() => isActive && clearNeedsInput(agentId)}
                  onKeyDown={() => isActive && clearNeedsInput(agentId)}
                >
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

  useEffect(() => {
    const apiBase = useBackendStore.getState().apiBase;
    fetch(`${apiBase}/api/agents/${agentId}/${agentName}/state`)
      .then((res) => res.json())
      .then((data) => {
        // Each user message already carries its fork anchor under
        // metadata.custom.user_input_id, so no separate mapping is needed.
        const history: UIMessage[] = Array.isArray(data.history)
          ? data.history
          : [];
        setInitialMessages(history);
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
