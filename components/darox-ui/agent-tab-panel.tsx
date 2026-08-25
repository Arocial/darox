"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import {
  useAgentTabs,
  sessionToAgentTab,
  type AgentTab,
  type SessionInfo,
} from "@/components/darox-ui/agent-store";
import { AgentIdContext } from "@/components/darox-ui/agent-id-context";
import { SubagentIdContext } from "@/components/darox-ui/subagent-id-context";
import { AgentNameContext } from "@/components/darox-ui/agent-name-context";
import { AgentStatusContext } from "@/components/darox-ui/agent-status-context";
import { WorkspaceContext } from "@/components/darox-ui/workspace-context";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import {
  acquireTransport,
  releaseTransport,
  httpBaseToWsUrl,
  type SessionState,
} from "@/components/darox-ui/websocket-chat-transport";
import { ModelPill } from "@/components/darox-ui/model-pill";
import { UserTurnAnchorsContext } from "@/components/darox-ui/user-turn-anchors-context";
import { useBackendCommands } from "@/hooks/use-backend-commands";
import {
  ChatSubmitContext,
  PendingUserMessagesContext,
  type PendingUserMessage,
} from "@/components/darox-ui/chat-submit-context";
import type { UIMessage } from "ai";
import {
  CommandInputsContext,
  type CommandInputItem,
} from "@/components/darox-ui/command-input-context";

function getUserInputId(message: UIMessage): string | undefined {
  if (message.role !== "user") return undefined;
  const metadata = message.metadata as
    | { custom?: { user_input_id?: unknown } }
    | undefined;
  const userInputId = metadata?.custom?.user_input_id;
  return typeof userInputId === "string" ? userInputId : undefined;
}

function getClientMessageId(message: UIMessage): string | undefined {
  if (message.role !== "user") return undefined;
  const metadata = message.metadata as
    | {
        custom?: {
          chatInputEventResult?: { client_message_id?: unknown };
        };
      }
    | undefined;
  const clientMessageId =
    metadata?.custom?.chatInputEventResult?.client_message_id;
  return typeof clientMessageId === "string" ? clientMessageId : undefined;
}

function ensureUniqueMessageIds(messages: UIMessage[]): UIMessage[] {
  const usedIds = new Set<string>();

  // Keep the state snapshot's array identity when no repair is needed. The
  // transport replays that same snapshot whenever the state listener is
  // resubscribed (for example when the active session changes), and AgentChat
  // uses the identity to avoid replacing newer streamed messages with the
  // initial history.
  if (
    messages.every((message) => {
      if (usedIds.has(message.id)) return false;
      usedIds.add(message.id);
      return true;
    })
  ) {
    return messages;
  }

  usedIds.clear();

  return messages.map((message, index) => {
    if (!usedIds.has(message.id)) {
      usedIds.add(message.id);
      return message;
    }

    // A retained turn can contain multiple user inputs. Older backends may
    // assign all of their started message echoes the retained turn's message
    // id, even though user_input_id identifies distinct timeline boundaries.
    const stableDisambiguator = getUserInputId(message) ?? String(index);
    const baseId = `${message.id}:duplicate:${stableDisambiguator}`;
    let uniqueId = baseId;
    let suffix = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${baseId}:${suffix++}`;
    }
    usedIds.add(uniqueId);
    return { ...message, id: uniqueId };
  });
}

function reconcileServerUserMessages(
  current: UIMessage[],
  serverMessages: UIMessage[],
): UIMessage[] {
  const next = [...current];
  for (const serverMessage of serverMessages) {
    const clientMessageId = getClientMessageId(serverMessage);
    const optimisticIndex =
      clientMessageId === undefined
        ? -1
        : next.findIndex(
            (message) => getClientMessageId(message) === clientMessageId,
          );
    if (optimisticIndex === -1) next.push(serverMessage);
    else next[optimisticIndex] = serverMessage;
  }
  return next;
}

function preserveUserMessageIds(
  current: UIMessage[],
  snapshot: UIMessage[],
): UIMessage[] {
  const currentUserIdsByInputId = new Map<string, string>();
  for (const message of current) {
    const userInputId = getUserInputId(message);
    if (userInputId !== undefined) {
      currentUserIdsByInputId.set(userInputId, message.id);
    }
  }

  const preserved = snapshot.map((message) => {
    const userInputId = getUserInputId(message);
    const currentId =
      userInputId === undefined
        ? undefined
        : currentUserIdsByInputId.get(userInputId);
    return currentId === undefined ? message : { ...message, id: currentId };
  });

  return ensureUniqueMessageIds(preserved);
}

function AgentChat({
  agentId,
  subagentId,
  agentName,
  status,
  workspace,
  initialMessages,
}: {
  agentId: string;
  subagentId: string;
  agentName: string;
  status: string;
  workspace: string;
  initialMessages: UIMessage[];
}) {
  const apiBase = useBackendStore((s) => s.apiBase);

  const url = useMemo(
    () => httpBaseToWsUrl(apiBase, agentId, subagentId),
    [apiBase, agentId, subagentId],
  );
  const transport = useMemo(() => acquireTransport(url), [url]);

  const chat = useChat({
    id: `${agentId}:${agentName}`,
    transport,
    messages: initialMessages,
  });
  const resumePromiseRef = useRef<Promise<void> | null>(null);
  const pendingUserMessagesRef = useRef<UIMessage[]>([]);
  const userBoundaryDrainRef = useRef<Promise<void> | null>(null);
  const seenClientMessageIdsRef = useRef(new Set<string>());
  const appliedCommandTimelineRef = useRef<SessionState["timeline"] | null>(
    null,
  );
  const [pendingUserMessages, setPendingUserMessages] = useState<
    PendingUserMessage[]
  >([]);
  const [commandInputs, setCommandInputs] = useState<CommandInputItem[]>([]);
  const resumeChatStream = useCallback(() => {
    if (resumePromiseRef.current) return;

    const resumePromise = chat.resumeStream();
    resumePromiseRef.current = resumePromise;
    const clearResume = () => {
      if (resumePromiseRef.current === resumePromise) {
        resumePromiseRef.current = null;
      }
    };
    void resumePromise.then(clearResume, clearResume);
  }, [chat.resumeStream]);

  const queueServerUserMessage = useCallback(
    (message: UIMessage) => {
      transport.splitAtUserMessage();
      pendingUserMessagesRef.current.push(message);
      if (userBoundaryDrainRef.current) return;

      // Closing the controller is synchronous, but AI SDK may still have
      // queued update jobs. Wait for that consumer to settle before inserting
      // the user boundary, otherwise a late write can appear below the user.
      const precedingSegment = resumePromiseRef.current;
      const drain = Promise.resolve(precedingSegment).then(() => {
        const pending = pendingUserMessagesRef.current.splice(0);
        if (pending.length > 0) {
          chat.setMessages((prev) =>
            reconcileServerUserMessages(prev, pending),
          );
          const confirmedIds = new Set(
            pending
              .map(getClientMessageId)
              .filter((id): id is string => id !== undefined),
          );
          setPendingUserMessages((current) =>
            current.filter(
              (pendingMessage) =>
                !confirmedIds.has(pendingMessage.clientMessageId),
            ),
          );
        }
        if (userBoundaryDrainRef.current === drain) {
          userBoundaryDrainRef.current = null;
        }
        if (pendingUserMessagesRef.current.length > 0) {
          queueServerUserMessage(pendingUserMessagesRef.current.shift()!);
          return;
        }
        resumeChatStream();
      });
      userBoundaryDrainRef.current = drain;
    },
    [chat.setMessages, resumeChatStream, transport],
  );

  useEffect(() => {
    if (status === "closed") {
      transport.close();
      if (chat.status === "submitted" || chat.status === "streaming") {
        chat.stop();
      }
    }
  }, [status, transport, chat.status, chat.stop]);

  const runtime = useAISDKRuntime(chat);

  const setCompletionUnread = useAgentTabs((s) => s.setCompletionUnread);
  const clearCompletionUnread = useAgentTabs((s) => s.clearCompletionUnread);
  const setBusy = useAgentTabs((s) => s.setBusy);
  const updateAgent = useAgentTabs((s) => s.updateAgent);
  const isActive = useAgentTabs((s) => s.activeId === agentId);
  const busyRef = useRef(false);

  useEffect(() => {
    if (status !== "closed") return;
    busyRef.current = false;
    setBusy(agentId, agentName, false);
  }, [status, agentId, agentName, setBusy]);

  useEffect(
    () => () => setBusy(agentId, agentName, false),
    [agentId, agentName, setBusy],
  );

  const applyBusyState = useCallback(
    (busy: boolean) => {
      const turnEnded = busyRef.current && !busy;
      busyRef.current = busy;
      if (busy) {
        transport.beginBusyEpoch();
        resumeChatStream();
      } else {
        transport.endBusyEpoch();
      }
      setBusy(agentId, agentName, busy);
      if (busy) setCompletionUnread(agentId, agentName, false);
      if (!turnEnded || (isActive && document.hasFocus())) return;

      setCompletionUnread(agentId, agentName, true);
      if (!("Notification" in window)) return;
      const notify = () =>
        new Notification(`Turn completed: ${agentName}`, {
          body: `Task completed in ${workspace}`,
        });
      if (Notification.permission === "granted") notify();
      else if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((permission) => {
          if (permission === "granted") notify();
        });
      }
    },
    [
      agentId,
      agentName,
      isActive,
      resumeChatStream,
      setBusy,
      setCompletionUnread,
      transport,
      workspace,
    ],
  );

  useEffect(() => {
    if (!isActive) return;

    const handleInteraction = () => {
      clearCompletionUnread(agentId);
    };

    window.addEventListener("focus", handleInteraction);
    return () => {
      window.removeEventListener("focus", handleInteraction);
    };
  }, [isActive, agentId, clearCompletionUnread]);

  // Apply a state that arrived after the loader snapshot before subscribing to
  // replayed commands. onState immediately emits its cached state, so ignore
  // the exact history array already used to initialize useChat. This also
  // prevents React Strict Mode's second effect setup from overwriting commands
  // drained during the first setup.
  useEffect(
    () =>
      transport.onState((state) => {
        applyBusyState(state.busy);
        if (state.timeline !== appliedCommandTimelineRef.current) {
          appliedCommandTimelineRef.current = state.timeline;
          let messageIndex = 0;
          setCommandInputs(
            state.timeline.flatMap((entry) => {
              if (entry.type === "message") {
                messageIndex += 1;
                return [];
              }
              if (typeof entry.client_message_id !== "string") return [];
              return [
                {
                  clientMessageId: entry.client_message_id,
                  beforeMessageIndex: messageIndex,
                  serverMessageId: entry.server_message_id,
                  command: entry.command,
                  status: entry.status,
                  output: entry.output,
                  error: entry.error,
                },
              ];
            }),
          );
        }
        if (state.history === initialMessages) return;
        chat.setMessages((current) =>
          preserveUserMessageIds(current, state.history),
        );
      }),
    [transport, chat.setMessages, initialMessages, applyBusyState],
  );

  useBackendCommands(url, (cmd) => {
    if (cmd.type === "cmd-turn-state") {
      applyBusyState(cmd.busy === true);
    } else if (cmd.type === "cmd-client-input") {
      const payload = cmd.payload as
        | {
            type?: unknown;
            status?: unknown;
            message?: unknown;
            command?: unknown;
          }
        | undefined;
      const clientMessageId = cmd.client_message_id;
      if (
        payload?.type === "command" &&
        payload.status === "accepted" &&
        typeof clientMessageId === "string"
      ) {
        setPendingUserMessages((current) =>
          current.filter(
            (pendingMessage) =>
              pendingMessage.clientMessageId !== clientMessageId,
          ),
        );
        setCommandInputs((current) => {
          const next: CommandInputItem = {
            clientMessageId,
            beforeMessageIndex: chat.messages.length,
            serverMessageId:
              typeof cmd.server_message_id === "string"
                ? cmd.server_message_id
                : undefined,
            command: payload.command,
            status: "accepted",
          };
          const index = current.findIndex(
            (item) => item.clientMessageId === clientMessageId,
          );
          if (index === -1) return [...current, next];
          return current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...next } : item,
          );
        });
        return;
      }
      if (payload?.type !== "message" || payload.status !== "started") return;
      const message = payload.message as UIMessage | undefined;
      if (!message || message.role !== "user" || typeof message.id !== "string")
        return;
      if (
        typeof clientMessageId === "string" &&
        seenClientMessageIdsRef.current.has(clientMessageId)
      )
        return;
      if (typeof clientMessageId === "string") {
        seenClientMessageIdsRef.current.add(clientMessageId);
      }
      const echoedMessage =
        typeof clientMessageId === "string"
          ? {
              ...message,
              // The backend message id can be shared by every accepted input
              // in one retained turn. The client id is unique per submission
              // and also replaces the matching optimistic message in-place.
              id: clientMessageId,
              metadata: {
                ...(message.metadata as object | undefined),
                custom: {
                  ...(message.metadata as { custom?: Record<string, unknown> })
                    ?.custom,
                  chatInputEventResult: {
                    client_message_id: clientMessageId,
                  },
                },
              },
            }
          : message;
      // The backend echo is the canonical user-message timeline boundary.
      // Finish the preceding assistant segment before inserting it, then
      // attach a fresh AI SDK sink for subsequent output on the same socket.
      queueServerUserMessage(echoedMessage);
    } else if (cmd.type === "cmd-command-completed") {
      const input = cmd.input as
        | {
            client_message_id?: unknown;
            server_message_id?: unknown;
            payload?: { command?: unknown };
          }
        | undefined;
      const clientMessageId = input?.client_message_id;
      if (typeof clientMessageId !== "string") return;
      setPendingUserMessages((current) =>
        current.filter(
          (pendingMessage) =>
            pendingMessage.clientMessageId !== clientMessageId,
        ),
      );
      setCommandInputs((current) => {
        const completed: CommandInputItem = {
          clientMessageId,
          beforeMessageIndex: chat.messages.length,
          serverMessageId:
            typeof input?.server_message_id === "string"
              ? input.server_message_id
              : undefined,
          command: input?.payload?.command,
          status: typeof cmd.status === "string" ? cmd.status : "error",
          output: typeof cmd.output === "string" ? cmd.output : undefined,
          error: typeof cmd.error === "string" ? cmd.error : undefined,
        };
        const found = current.some(
          (item) => item.clientMessageId === clientMessageId,
        );
        return found
          ? current.map((item) =>
              item.clientMessageId === clientMessageId
                ? {
                    ...completed,
                    beforeMessageIndex: item.beforeMessageIndex,
                  }
                : item,
            )
          : [...current, completed];
      });
    } else if (cmd.type === "cmd-session-tree") {
      updateAgent(sessionToAgentTab(cmd as unknown as SessionInfo));
    }
  });

  // Recover a busy epoch after buffered state and commands have been applied.
  useEffect(() => {
    if (status !== "closed") resumeChatStream();
  }, [status, resumeChatStream]);

  useEffect(() => {
    return () => {
      releaseTransport(url);
    };
  }, [url]);

  const anchorsValue = useMemo(
    () => ({
      forkAt: (server_message_id: string) =>
        transport.sendCommand({
          type: "ForkEvent",
          event_id: server_message_id,
        }),
    }),
    [transport],
  );

  const submitUserMessage = useCallback(
    async (message: UIMessage) => {
      const clientMessageId = getClientMessageId(message);
      if (clientMessageId === undefined) {
        throw new Error("User message is missing a client message id");
      }
      setPendingUserMessages((current) => [
        ...current,
        { clientMessageId, message },
      ]);
      try {
        await transport.sendUserInput(message);
      } catch (error) {
        setPendingUserMessages((current) =>
          current.filter(
            (pendingMessage) =>
              pendingMessage.clientMessageId !== clientMessageId,
          ),
        );
        throw error;
      }
    },
    [transport],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      <AgentIdContext.Provider value={agentId}>
        <SubagentIdContext.Provider value={subagentId}>
          <AgentNameContext.Provider value={agentName}>
            <AgentStatusContext.Provider value={status}>
              <ChatSubmitContext.Provider value={submitUserMessage}>
                <PendingUserMessagesContext.Provider
                  value={pendingUserMessages}
                >
                  <UserTurnAnchorsContext.Provider value={anchorsValue}>
                    <CommandInputsContext.Provider value={commandInputs}>
                      <AssistantRuntimeProvider runtime={runtime}>
                        <div
                          className="h-full"
                          onMouseDown={() =>
                            isActive && clearCompletionUnread(agentId)
                          }
                          onKeyDown={() =>
                            isActive && clearCompletionUnread(agentId)
                          }
                        >
                          <Thread />
                        </div>
                      </AssistantRuntimeProvider>
                    </CommandInputsContext.Provider>
                  </UserTurnAnchorsContext.Provider>
                </PendingUserMessagesContext.Provider>
              </ChatSubmitContext.Provider>
            </AgentStatusContext.Provider>
          </AgentNameContext.Provider>
        </SubagentIdContext.Provider>
      </AgentIdContext.Provider>
    </WorkspaceContext.Provider>
  );
}

function AgentChatLoader({
  agentId,
  subagentId,
  agentName,
  status,
  workspace,
}: {
  agentId: string;
  subagentId: string;
  agentName: string;
  status: string;
  workspace: string;
}) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );

  useEffect(() => {
    setInitialMessages(null);
    const apiBase = useBackendStore.getState().apiBase;
    const url = httpBaseToWsUrl(apiBase, agentId, subagentId);
    const transport = acquireTransport(url);
    let cancelled = false;
    transport
      .waitForState()
      .then((state) => {
        if (!cancelled)
          setInitialMessages(ensureUniqueMessageIds(state.history));
      })
      .catch((err) => {
        console.error("Failed to load session state", err);
        if (!cancelled) setInitialMessages([]);
      });
    return () => {
      cancelled = true;
      releaseTransport(url);
    };
  }, [agentId, subagentId, status]);

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
      subagentId={subagentId}
      agentName={agentName}
      status={status}
      workspace={workspace}
      initialMessages={initialMessages}
    />
  );
}

export function AgentTabPanel({
  agentId,
  workspace,
  agentTab,
}: {
  agentId: string;
  workspace: string;
  agentTab: AgentTab;
}) {
  const agents = useMemo(() => {
    const flatten = (agent: AgentTab): AgentTab[] => [
      agent,
      ...agent.subagents.flatMap(flatten),
    ];
    return flatten(agentTab);
  }, [agentTab]);
  const [activeSubagentId, setActiveSubagentId] = useState(agentTab.id);
  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set([agentTab.id]),
  );

  const handleSelect = (id: string) => {
    setActiveSubagentId(id);
    if (!mounted.has(id)) {
      setMounted((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  };

  return (
    <div className="relative h-full">
      {Array.from(mounted).map((id) => {
        const agent = agents.find((a) => a.id === id);
        if (!agent) return null;
        return (
          <div
            key={id}
            className={`absolute inset-0 ${
              activeSubagentId === id ? "visible z-10" : "invisible z-0"
            }`}
          >
            <AgentChatLoader
              agentId={agentId}
              subagentId={agent.id}
              agentName={agent.name}
              status={agent.status}
              workspace={workspace}
            />
          </div>
        );
      })}
      <div className="absolute top-3 left-3 z-20">
        <ModelPill agentId={agentId} subagentId={activeSubagentId} />
      </div>
      {agents.length > 1 && (
        <div className="absolute top-3 right-3 z-20 flex min-w-32 max-w-48 flex-col rounded-lg border bg-popover/95 py-1 shadow-md backdrop-blur-sm">
          <div className="mb-2 rounded-t-md border-border border-b bg-muted/60 px-3 py-1.5 font-semibold text-foreground/80 text-xs uppercase tracking-wider">
            Agents
          </div>
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleSelect(agent.id)}
              className={`mx-1 flex items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                activeSubagentId === agent.id
                  ? "bg-accent font-semibold text-foreground"
                  : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
              }`}
              title={
                agent.id === agentTab.id ? `${agent.name} (main)` : agent.name
              }
            >
              <span className="flex-1 truncate">{agent.name}</span>
              {agent.id === agentTab.id && (
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
