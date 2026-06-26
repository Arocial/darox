import { createContext, useContext } from "react";

export const AgentStatusContext = createContext<string>("active");

export function useAgentStatus() {
  return useContext(AgentStatusContext);
}
