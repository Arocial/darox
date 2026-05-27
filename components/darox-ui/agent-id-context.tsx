"use client";

import { createContext, useContext } from "react";

export const AgentIdContext = createContext<string | null>(null);

export function useAgentId(): string {
  const id = useContext(AgentIdContext);
  if (!id) {
    throw new Error(
      "useAgentId must be used within an AgentIdContext.Provider",
    );
  }
  return id;
}
