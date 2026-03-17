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

export type ChatInputEventArgs = {
  deferred_tools: Record<string, string>; // id: question
  normal_input: { request: boolean; user_input: string | null };
  exception_input: { exception: string | null; to_continue: boolean };
};

export type ChatInputEventResult = {
  deferred_tools: Record<string, string>; // id: answer
  exception_input: { to_continue: boolean };
  normal_input: { user_input: string | null };
};

export default function Chat() {
  const [inputArgs, setInputArgs] =
    useState<ChatInputEventArgs>(defaultInputArgs);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: 'http://localhost:8000/api/chat',
    }),
    onData: (dataPart) => {
      if (dataPart.type === 'data-input-request') {
        setInputArgs(dataPart.data as ChatInputEventArgs);
      }
    },
  });
  return (
    <ChatInputContext.Provider value={{ inputArgs, setInputArgs }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="h-dvh">
          <Thread />
        </div>
      </AssistantRuntimeProvider>
    </ChatInputContext.Provider>
  );
}
