import { createContext, useContext } from "react";

export const SubagentIdContext = createContext<string>("");

export function useSubagentId() {
  return useContext(SubagentIdContext);
}
