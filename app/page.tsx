'use client';

import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';

export default function Chat() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: 'http://localhost:8000/api/chat',
    }),
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-dvh">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
