"use client";
import { daroxFetch } from "@/lib/api";

import { useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import {
  ChatInputContext,
  defaultInputArgs,
} from "@/components/darox-ui/chat-input-context";
import { useAgentTabs, type AgentTab } from "@/components/darox-ui/agent-store";
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
} from "@/components/darox-ui/websocket-chat-transport";
import { ModelPill } from "@/components/darox-ui/model-pill";
import {
  UserTurnAnchorsContext,
  USER_INPUT_ID_KEY,
} from "@/components/darox-ui/user-turn-anchors-context";
import { sendAgentCommand } from "@/components/darox-ui/agent-command";
import { useBackendCommands } from "@/hooks/use-backend-commands";
import type { ChatInputEventArgs } from "@/types/chat";
import type { UIMessage } from "ai";

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
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);
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
    // resume: true triggers transport.reconnectToStream() on mount so we
    // start draining server-pushed events before the user submits anything.
    resume: status !== "closed",
  });

  useEffect(() => {
    if (status === "closed") {
      transport.close();
      setInputArgs(defaultInputArgs);
      if (chat.status === "submitted" || chat.status === "streaming") {
        chat.stop();
      }
    }
  }, [status, transport, chat.status, chat.stop]);

  const runtime = useAISDKRuntime(chat);

  const setNeedsInput = useAgentTabs((s) => s.setNeedsInput);
  const clearNeedsInput = useAgentTabs((s) => s.clearNeedsInput);
  const setStreaming = useAgentTabs((s) => s.setStreaming);
  const updateAgent = useAgentTabs((s) => s.updateAgent);
  const isActive = useAgentTabs((s) => s.activeId === agentId);
  const lastReqIdRef = useRef<string>("");

  useEffect(() => {
    const isBusy = chat.status === "submitted" || chat.status === "streaming";
    setStreaming(agentId, agentName, isBusy);
  }, [chat.status, agentId, agentName, setStreaming]);

  useEffect(() => {
    const needsInput = !!inputArgs.req_id;

    if (needsInput) {
      if (inputArgs.req_id !== lastReqIdRef.current) {
        lastReqIdRef.current = inputArgs.req_id;
        if (!isActive) {
          setNeedsInput(agentId, agentName, true);
        }

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
      }
    } else {
      setNeedsInput(agentId, agentName, false);
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

  useBackendCommands(url, (cmd) => {
    if (cmd.type === "cmd-input-request") {
      setInputArgs(cmd as unknown as ChatInputEventArgs);
    } else if (cmd.type === "cmd-user-turn") {
      const { server_message_id, client_message_id } = cmd as unknown as {
        server_message_id?: string;
        client_message_id?: string;
      };
      if (
        typeof server_message_id !== "string" ||
        typeof client_message_id !== "string"
      )
        return;
      // Stamp the fork anchor onto the user message's own metadata, in the
      // same place /state delivers it on reload (metadata.custom). No
      // separate message-id -> event-id map to maintain.
      chat.setMessages((prev) =>
        prev.map((m) => {
          if (m.role !== "user") return m;
          const custom = (m.metadata as { custom?: Record<string, any> })
            ?.custom;
          const foundClientMessageId =
            custom?.chatInputEventResult?.client_message_id;

          if (foundClientMessageId !== client_message_id) return m;
          if (custom?.[USER_INPUT_ID_KEY] === server_message_id) return m;
          return {
            ...m,
            metadata: {
              ...(m.metadata as object | undefined),
              custom: { ...custom, [USER_INPUT_ID_KEY]: server_message_id },
            },
          };
        }),
      );
    } else if (cmd.type === "cmd-agent-info") {
      updateAgent(cmd as unknown as AgentTab);
    }
  });

  useEffect(() => {
    return () => {
      releaseTransport(url);
    };
  }, [url]);

  const anchorsValue = useMemo(
    () => ({
      forkAt: (server_message_id: string) =>
        sendAgentCommand(apiBase, agentId, subagentId, {
          type: "ForkEvent",
          event_id: server_message_id,
        }),
    }),
    [apiBase, agentId, subagentId],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      <AgentIdContext.Provider value={agentId}>
        <SubagentIdContext.Provider value={subagentId}>
          <AgentNameContext.Provider value={agentName}>
            <AgentStatusContext.Provider value={status}>
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
    const apiBase = useBackendStore.getState().apiBase;
    daroxFetch(`${apiBase}/api/agents/${agentId}/${subagentId}/state`)
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
  }, [agentId, subagentId]);

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
  const agents = useMemo(
    () => [agentTab, ...(agentTab.subagents || [])],
    [agentTab],
  );
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
