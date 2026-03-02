'use client';

import { useDataStreamRuntime } from '@assistant-ui/react-data-stream';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';

export default function Chat() {
  const runtime = useDataStreamRuntime({
    api: 'http://localhost:8000/api/chat',
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-dvh">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
