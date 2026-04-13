'use client';

import { useState, useEffect } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import {
  ChatInputContext,
  defaultInputArgs,
} from '@/components/darox-ui/chat-input-context';
import { ComposerIdContext } from '@/components/darox-ui/composer-id-context';
import { WorkspaceContext } from '@/components/darox-ui/workspace-context';
import { useBackendStore } from '@/components/darox-ui/backend-store';
import type { ChatInputEventArgs } from '@/app/page';
import type { UIMessage } from 'ai';

function ComposerChat({ composerId, workspace, initialMessages }: { composerId: string; workspace: string; initialMessages: UIMessage[] }) {
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);
  const apiBase = useBackendStore((s) => s.apiBase);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${apiBase}/api/composers/${composerId}/chat`,
    }),
    messages: initialMessages,
    onData: (dataPart) => {
      if (dataPart.type === 'data-input-request') {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      }
    },
  });

  return (
    <WorkspaceContext.Provider value={workspace}>
      <ComposerIdContext.Provider value={composerId}>
        <ChatInputContext.Provider value={{ inputArgs, setInputArgs }}>
          <AssistantRuntimeProvider runtime={runtime}>
            <div className="h-full">
              <Thread />
            </div>
          </AssistantRuntimeProvider>
        </ChatInputContext.Provider>
      </ComposerIdContext.Provider>
    </WorkspaceContext.Provider>
  );
}

export function ComposerTabPanel({ composerId, workspace }: { composerId: string; workspace: string }) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    const apiBase = useBackendStore.getState().apiBase;
    fetch(`${apiBase}/api/composers/${composerId}/history`)
      .then((res) => res.json())
      .then((data) => setInitialMessages(data))
      .catch((err) => {
        console.error('Failed to fetch history', err);
        setInitialMessages([]);
      });
  }, [composerId]);

  if (initialMessages === null) {
    return <div className="flex h-full items-center justify-center">Loading history...</div>;
  }

  return <ComposerChat composerId={composerId} workspace={workspace} initialMessages={initialMessages} />;
}
