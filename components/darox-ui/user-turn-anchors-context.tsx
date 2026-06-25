"use client";

import { createContext, useContext } from "react";
import type { AgentCommandAck } from "./agent-command";

// Key under which a user message's fork anchor (the backend `user_input`
// session-event id) is stored on its `metadata.custom`. Set live from the
// `data-user-turn` event and delivered the same way by `/state` on reload,
// so the message itself is the single source of truth — no id mapping.
export const USER_INPUT_ID_KEY = "user_input_id";

export type UserTurnAnchorsContextValue = {
  // Fork the current session at the given event id. Returns the server ack
  // carrying the new session id in `output`.
  forkAt: (server_message_id: string) => Promise<AgentCommandAck>;
};

export const UserTurnAnchorsContext =
  createContext<UserTurnAnchorsContextValue | null>(null);

export function useUserTurnAnchors(): UserTurnAnchorsContextValue | null {
  return useContext(UserTurnAnchorsContext);
}
