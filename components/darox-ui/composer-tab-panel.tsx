'use client';

import { useState } from 'react';
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
import type { ChatInputEventArgs } from '@/app/page';

const API_BASE = 'http://localhost:8000';

export function ComposerTabPanel({ composerId }: { composerId: string }) {
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${API_BASE}/api/composers/${composerId}/chat`,
    }),
    onData: (dataPart) => {
      if (dataPart.type === 'data-input-request') {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      }
    },
  });

  return (
    <ComposerIdContext.Provider value={composerId}>
      <ChatInputContext.Provider value={{ inputArgs, setInputArgs }}>
        <AssistantRuntimeProvider runtime={runtime}>
          <div className="h-full">
            <Thread />
          </div>
        </AssistantRuntimeProvider>
      </ChatInputContext.Provider>
    </ComposerIdContext.Provider>
  );
}
