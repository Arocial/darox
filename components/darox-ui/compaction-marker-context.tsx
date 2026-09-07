"use client";

import { createContext, useContext } from "react";
import type { CompactionState } from "@/components/darox-ui/websocket-chat-transport";

export type CompactionMarkerItem = CompactionState & {
  beforeMessageIndex: number;
};

export const CompactionMarkersContext = createContext<CompactionMarkerItem[]>(
  [],
);

export function useCompactionMarkers(): CompactionMarkerItem[] {
  return useContext(CompactionMarkersContext);
}
