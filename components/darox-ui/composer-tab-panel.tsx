'use client';

import { useState, useEffect, useMemo } from 'react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import {
  ChatInputContext,
  defaultInputArgs,
} from '@/components/darox-ui/chat-input-context';
import { ComposerIdContext } from '@/components/darox-ui/composer-id-context';
import { AgentNameContext } from '@/components/darox-ui/agent-name-context';
import { WorkspaceContext } from '@/components/darox-ui/workspace-context';
import { useBackendStore } from '@/components/darox-ui/backend-store';
import {
  acquireTransport,
  releaseTransport,
  httpBaseToWsUrl,
} from '@/components/darox-ui/websocket-chat-transport';
import type { ChatInputEventArgs } from '@/app/page';
import type { UIMessage } from 'ai';

function AgentChat({
  composerId,
  agentName,
  workspace,
  initialMessages,
}: {
  composerId: string;
  agentName: string;
  workspace: string;
  initialMessages: UIMessage[];
}) {
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);
  const apiBase = useBackendStore((s) => s.apiBase);

  const url = useMemo(
    () => httpBaseToWsUrl(apiBase, composerId, agentName),
    [apiBase, composerId, agentName],
  );
  const transport = useMemo(() => acquireTransport(url), [url]);

  useEffect(() => {
    return () => {
      releaseTransport(url);
    };
  }, [url]);

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages,
    // resume: true triggers transport.reconnectToStream() on mount so we
    // start draining server-pushed events before the user submits anything.
    resume: true,
    onData: (dataPart) => {
      if (dataPart.type === 'data-input-request') {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      }
    },
  } as Parameters<typeof useChatRuntime>[0]);

  return (
    <WorkspaceContext.Provider value={workspace}>
      <ComposerIdContext.Provider value={composerId}>
        <AgentNameContext.Provider value={agentName}>
          <ChatInputContext.Provider value={{ inputArgs, setInputArgs }}>
            <AssistantRuntimeProvider runtime={runtime}>
              <div className="h-full">
                <Thread />
              </div>
            </AssistantRuntimeProvider>
          </ChatInputContext.Provider>
        </AgentNameContext.Provider>
      </ComposerIdContext.Provider>
    </WorkspaceContext.Provider>
  );
}

function AgentChatLoader({
  composerId,
  agentName,
  workspace,
}: {
  composerId: string;
  agentName: string;
  workspace: string;
}) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );

  useEffect(() => {
    const apiBase = useBackendStore.getState().apiBase;
    fetch(`${apiBase}/api/composers/${composerId}/agents/${agentName}/history`)
      .then((res) => res.json())
      .then((data) => setInitialMessages(data))
      .catch((err) => {
        console.error('Failed to fetch history', err);
        setInitialMessages([]);
      });
  }, [composerId, agentName]);

  if (initialMessages === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading history...
      </div>
    );
  }

  return (
    <AgentChat
      composerId={composerId}
      agentName={agentName}
      workspace={workspace}
      initialMessages={initialMessages}
    />
  );
}

export function ComposerTabPanel({
  composerId,
  workspace,
  mainAgent,
  subagents,
}: {
  composerId: string;
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
            activeAgent === name ? 'z-10 visible' : 'z-0 invisible'
          }`}
        >
          <AgentChatLoader
            composerId={composerId}
            agentName={name}
            workspace={workspace}
          />
        </div>
      ))}
      {agents.length > 1 && (
        <div className="absolute top-3 right-3 z-20 flex flex-col rounded-lg border bg-popover/95 backdrop-blur-sm shadow-md py-1 min-w-32 max-w-48">
          <div className="px-3 py-1.5 mb-2 text-xs font-semibold text-foreground/80 uppercase tracking-wider bg-muted/60 border-b border-border rounded-t-md">
            Agents
          </div>
          {agents.map((name) => (
            <button
              key={name}
              onClick={() => handleSelect(name)}
              className={`flex items-center gap-2 px-3 py-1.5 text-left text-sm rounded-sm mx-1 transition-colors ${
                activeAgent === name
                  ? 'bg-accent text-foreground font-semibold'
                  : 'text-foreground/70 hover:text-foreground hover:bg-muted/60'
              }`}
              title={name === mainAgent ? `${name} (main)` : name}
            >
              <span className="truncate flex-1">{name}</span>
              {name === mainAgent && (
                <span className="text-[10px] text-muted-foreground shrink-0">
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
