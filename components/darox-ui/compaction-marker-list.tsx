"use client";

import { Minimize2Icon } from "lucide-react";
import { useCompactionMarkers } from "@/components/darox-ui/compaction-marker-context";

const triggerLabels = {
  manual: "Manual compaction",
  token_threshold: "Automatic compaction",
  tool_request: "Tool-requested compaction",
} as const;

export function CompactionMarkerList({
  beforeMessageIndex,
}: {
  beforeMessageIndex: number;
}) {
  const markers = useCompactionMarkers().filter(
    (marker) => marker.beforeMessageIndex === beforeMessageIndex,
  );

  return markers.map((marker) => (
    <div
      key={marker.event_id}
      className="flex items-center gap-2 py-1 text-muted-foreground text-xs"
      data-slot="compaction-marker"
      title={`${triggerLabels[marker.trigger]} · ${marker.timestamp}`}
    >
      <span className="h-px flex-1 bg-border/70" />
      <span className="flex shrink-0 items-center gap-1.5">
        <Minimize2Icon className="size-3" />
        Context compacted
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  ));
}
