"use client";

import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import type { WebSocketChatTransport } from "./websocket-chat-transport";
import { Button } from "@/components/ui/button";

export function ConnectionRecovery({
  transport,
  active,
  resume,
}: {
  transport: WebSocketChatTransport<UIMessage>;
  active: boolean;
  resume: () => void;
}) {
  const [disconnected, setDisconnected] = useState(!transport.connected);
  const [replaced, setReplaced] = useState(transport.replaced);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    setDisconnected(!transport.connected);
    setReplaced(transport.replaced);
    let disposed = false;
    let reconnecting = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = async (force = false) => {
      if (
        disposed ||
        reconnecting ||
        transport.replaced ||
        document.hidden ||
        !navigator.onLine
      )
        return;
      if (!force && transport.connected) return;
      reconnecting = true;
      clearTimeout(timer);
      setDisconnected(true);
      transport.close();
      try {
        await transport.waitForState();
        if (!disposed) {
          setDisconnected(false);
          failures = 0;
          resume();
        }
      } catch {
        if (!disposed && !transport.replaced) {
          transport.close();
          clearTimeout(timer);
          timer = setTimeout(
            () => void recover(),
            Math.min(1000 * 2 ** failures++, 30000),
          );
        }
      } finally {
        reconnecting = false;
      }
    };
    const offDisconnect = transport.onDisconnect((code) => {
      setDisconnected(true);
      setReplaced(code === 4000);
      clearTimeout(timer);
      if (code !== 4000) timer = setTimeout(() => void recover(), 1000);
    });
    const offState = transport.onState(() => {
      if (transport.connected) {
        setDisconnected(false);
        setReplaced(false);
      }
    });
    const foreground = () => {
      if (!document.hidden) void recover();
    };
    const online = () => void recover(true);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", foreground);
    void recover();
    return () => {
      disposed = true;
      clearTimeout(timer);
      offDisconnect();
      offState();
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [transport, active, resume, attempt]);

  if (!disconnected) return null;
  return (
    <div
      className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2 text-sm"
      role="status"
    >
      <span>
        {replaced
          ? "This session is open on another device."
          : "Connection lost. Reconnecting when online…"}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          transport.replaced = false;
          setReplaced(false);
          setAttempt((value) => value + 1);
        }}
      >
        {replaced ? "Use here" : "Reconnect"}
      </Button>
    </div>
  );
}
