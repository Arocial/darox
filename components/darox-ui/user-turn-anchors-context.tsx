"use client";

import { createContext, useContext } from "react";
import type { AgentCommandAck } from "./agent-command";

export type UserTurnAnchorsContextValue = {
  // Map from UI message id to the absolute event index of its corresponding
  // `user_input` session event. Look up by the clicked message's id — no
  // positional counting needed.
  anchors: ReadonlyMap<string, number>;
  // Fork the current session at the given absolute event index. Returns
  // the server ack carrying the new session id in `output`.
  forkAt: (eventIndex: number) => Promise<AgentCommandAck>;
};

export const UserTurnAnchorsContext =
  createContext<UserTurnAnchorsContextValue | null>(null);

export function useUserTurnAnchors(): UserTurnAnchorsContextValue | null {
  return useContext(UserTurnAnchorsContext);
}
