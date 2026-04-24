'use client';

import { createContext, useContext } from 'react';
import type { ChatInputEventArgs } from '@/app/page';

export const defaultInputArgs: ChatInputEventArgs = {
  deferred_tools: {},
  normal_input: { request: false, user_input: null },
  exception_input: { exception: null, retry: true },
};

export const ChatInputContext = createContext<{
  inputArgs: ChatInputEventArgs;
  setInputArgs: (args: ChatInputEventArgs) => void;
} | null>(null);

export function useChatInput() {
  const context = useContext(ChatInputContext);
  if (!context) {
    throw new Error('useChatInput must be used within a ChatInputProvider');
  }
  return context;
}
