"use client";

import { createContext, useContext } from "react";
import type { UIMessage } from "ai";

export type SubmitUserMessage = (message: UIMessage) => Promise<void>;

export const ChatSubmitContext = createContext<SubmitUserMessage | null>(null);

export function useChatSubmit(): SubmitUserMessage {
  const submit = useContext(ChatSubmitContext);
  if (!submit) throw new Error("ChatSubmitContext is not available");
  return submit;
}
