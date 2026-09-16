"use client";

import { createContext, useContext } from "react";

export type CommandInputItem = {
  inputId: string;
  clientMessageId?: string;
  beforeMessageIndex: number;
  command: unknown;
  status: "accepted" | string;
  output?: string;
  error?: string;
};

export const CommandInputsContext = createContext<CommandInputItem[]>([]);

export function useCommandInputs(): CommandInputItem[] {
  return useContext(CommandInputsContext);
}
