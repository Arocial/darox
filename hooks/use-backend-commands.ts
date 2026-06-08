import { useEffect, useRef } from "react";
import {
  acquireTransport,
  releaseTransport,
  type BackendCommand,
} from "@/components/darox-ui/websocket-chat-transport";

export function useBackendCommands(
  url: string,
  onCommand: (cmd: BackendCommand) => void,
) {
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    if (!url) return;

    const transport = acquireTransport(url);
    const unsubscribe = transport.onCommand((cmd) => onCommandRef.current(cmd));

    return () => {
      unsubscribe();
      releaseTransport(url);
    };
  }, [url]);
}
