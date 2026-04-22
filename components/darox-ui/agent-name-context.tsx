'use client';

import { createContext, useContext } from 'react';

export const AgentNameContext = createContext<string | null>(null);

export function useAgentName(): string {
  const name = useContext(AgentNameContext);
  if (!name) {
    throw new Error('useAgentName must be used within an AgentNameContext.Provider');
  }
  return name;
}
