"use client";

import { createContext, useContext } from "react";

export type CommandInputItem = {
  clientMessageId: string;
  beforeMessageIndex: number;
  serverMessageId?: string;
  command: unknown;
  status: "accepted" | string;
  output?: string;
  error?: string;
};

export const CommandInputsContext = createContext<CommandInputItem[]>([]);

export function useCommandInputs(): CommandInputItem[] {
  return useContext(CommandInputsContext);
}
