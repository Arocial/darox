"use client";

import { createContext, useContext } from "react";
import type { UIMessage } from "ai";

export type SubmitUserMessage = (message: UIMessage) => Promise<void>;

export type PendingUserMessage = {
  clientMessageId: string;
  message: UIMessage;
};

export const ChatSubmitContext = createContext<SubmitUserMessage | null>(null);
export const PendingUserMessagesContext = createContext<PendingUserMessage[]>(
  [],
);

export function useChatSubmit(): SubmitUserMessage {
  const submit = useContext(ChatSubmitContext);
  if (!submit) throw new Error("ChatSubmitContext is not available");
  return submit;
}

export function usePendingUserMessages(): PendingUserMessage[] {
  return useContext(PendingUserMessagesContext);
}
