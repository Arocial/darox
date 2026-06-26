import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

type WsServerFrame =
  | { type: "ack"; status: string }
  | { type: "step-done" }
  | { type: "data-input-request"; data: unknown }
  | ({ type: string } & Record<string, unknown>);

export type BackendCommand = {
  type: string;
  [key: string]: unknown;
};

export type CommandListener = (cmd: BackendCommand) => void;

export class WebSocketChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  private url: string;
  private ws: WebSocket | null = null;
  private openPromise: Promise<void> | null = null;
  private closingPromise: Promise<void> | null = null;
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null =
    null;
  private controllerClosed = true;
  private abortCleanup: (() => void) | null = null;
  // FIFO of resolvers awaiting an ack for a sent command. Acks are 1:1 with
  // client-sent frames per the API contract.
  private commandAckQueue: Array<
    (ack: { status: string; output?: string }) => void
  > = [];
  // Listeners for backend-initiated one-shot commands
  private commandListeners: Set<CommandListener> = new Set();

  constructor(options: { url: string }) {
    this.url = options.url;
  }

  private ensureOpen(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        this.openPromise = null;
        reject(err);
        return;
      }
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => {
        // onclose will follow — let it handle reject + cleanup
      };
      ws.onclose = () => {
        const wasOpening = this.openPromise;
        this.ws = null;
        this.openPromise = null;
        if (wasOpening) reject(new Error("WebSocket closed before open"));
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
    return this.openPromise;
  }

  public onCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }

  private enqueue(chunk: UIMessageChunk) {
    if (this.controller && !this.controllerClosed) {
      try {
        this.controller.enqueue(chunk);
      } catch {
        this.controllerClosed = true;
      }
    }
  }

  private closeController() {
    if (this.controller && !this.controllerClosed) {
      try {
        this.controller.close();
      } catch {}
    }
    this.controller = null;
    this.controllerClosed = true;
    if (this.abortCleanup) {
      this.abortCleanup();
      this.abortCleanup = null;
    }
  }

  private failController(err: Error) {
    if (this.controller && !this.controllerClosed) {
      try {
        this.controller.error(err);
      } catch {}
    }
    this.controller = null;
    this.controllerClosed = true;
    if (this.abortCleanup) {
      this.abortCleanup();
      this.abortCleanup = null;
    }
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let msg: WsServerFrame;
    try {
      msg = JSON.parse(raw) as WsServerFrame;
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;

    if (msg.type.startsWith("cmd-")) {
      const command = msg as BackendCommand;
      this.commandListeners.forEach((listener) => {
        listener(command);
      });
      return;
    }

    switch (msg.type) {
      case "ack": {
        const ack = msg as { status?: string; output?: string };
        const resolver = this.commandAckQueue.shift();
        if (resolver) {
          resolver({ status: ack.status ?? "ok", output: ack.output });
        }
        if (ack.status === "cancelled") {
          this.closeController();
        }
        return;
      }
      case "stream-close":
        this.closeController();
        return;
      case "step-done":
        return;
      default: {
        const chunk = msg as UIMessageChunk;
        this.enqueue(chunk);
        return;
      }
    }
  }

  private extractReply(messages: UI_MESSAGE[]): UI_MESSAGE {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      throw new Error("No user message to send");
    }
    return lastUser;
  }

  sendMessages: ChatTransport<UI_MESSAGE>["sendMessages"] = async (options) => {
    const reply = this.extractReply(options.messages);
    await this.ensureOpen();

    // Close any prior stream (defensive — runtime should not overlap).
    if (this.controller && !this.controllerClosed) {
      this.closeController();
    }

    const stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        this.controllerClosed = false;
      },
      cancel: () => {
        this.controller = null;
        this.controllerClosed = true;
      },
    });

    if (options.abortSignal) {
      const signal = options.abortSignal;
      const onAbort = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ cancel: true }));
          } catch {}
        }
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
        this.abortCleanup = () => signal.removeEventListener("abort", onAbort);
      }
    }

    try {
      this.ws!.send(JSON.stringify({ reply }));
    } catch (err) {
      this.failController(err instanceof Error ? err : new Error(String(err)));
    }

    return stream;
  };

  /**
   * Send a structured command (slash-equivalent) without going through the
   * LLM. Returns the server's ack. The caller is responsible for serializing
   * concurrent calls if it cares about ack ordering.
   */
  async sendCommand(event: {
    type: string;
    [key: string]: unknown;
  }): Promise<{ status: string; output?: string }> {
    await this.ensureOpen();
    const ackPromise = new Promise<{ status: string; output?: string }>(
      (resolve) => {
        this.commandAckQueue.push(resolve);
      },
    );
    try {
      this.ws!.send(JSON.stringify({ command: event }));
    } catch (err) {
      // Pop the resolver we just pushed so the queue stays consistent.
      const idx = this.commandAckQueue.length - 1;
      if (idx >= 0) this.commandAckQueue.splice(idx, 1);
      throw err instanceof Error ? err : new Error(String(err));
    }
    return ackPromise;
  }

  reconnectToStream: ChatTransport<UI_MESSAGE>["reconnectToStream"] =
    async () => {
      // If a previous close() is still tearing the socket down, wait for its
      // onclose to fire before opening a new one. Avoids Strict-Mode churn
      // where mount → unmount → mount races a CONNECTING socket against a new
      // ensureOpen(), and prevents the stale onclose from clobbering the new
      // controller.
      // Note: We are caching websocket connection for now and hence no closingPromise.
      // As a result, the closingPromise mechanism is not necessary in current impl.
      if (this.closingPromise) {
        await this.closingPromise;
      }
      await this.ensureOpen();

      // Avoid close the previous controller on remount of strict-mode.
      // We didn't close the controller on unmount, So we wait for previous controller
      // to finish by itself.
      for (let i = 0; i < 10; i++) {
        if (!this.controller || this.controllerClosed) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.controller && !this.controllerClosed) {
        this.closeController();
      }

      const stream = new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          this.controller = controller;
          this.controllerClosed = false;
        },
        cancel: () => {
          this.controller = null;
          this.controllerClosed = true;
        },
      });
      try {
        this.ws!.send(JSON.stringify({ resume: true }));
      } catch (err) {
        this.failController(
          err instanceof Error ? err : new Error(String(err)),
        );
      }

      return stream;
    };

  close() {
    const ws = this.ws;
    this.ws = null;
    this.openPromise = null;
    if (!ws) return;

    if (ws.readyState === WebSocket.CLOSED) {
      this.closingPromise = null;
      return;
    }

    // Detach the handlers bound to `this` — a late onclose firing after a
    // new socket has been created would otherwise null out the new ws and
    // fail the new controller.
    ws.onopen = null;
    ws.onerror = null;
    ws.onmessage = null;
    const closing = new Promise<void>((resolve) => {
      ws.onclose = () => {
        ws.onclose = null;
        if (this.closingPromise === closing) this.closingPromise = null;
        resolve();
      };
    });
    this.closingPromise = closing;
    try {
      ws.close();
    } catch {}
  }
}

import { appendWsToken } from "@/lib/api";

export function httpBaseToWsUrl(
  apiBase: string,
  agentId: string,
  subagentId: string,
): string {
  const wsBase = apiBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return appendWsToken(`${wsBase}/api/agents/${agentId}/${subagentId}/ws`);
}

// Module-level cache keyed by URL. Lets StrictMode's unmount→remount reuse
// the same underlying WS connection instead of reconnecting (the backend
// does not carry pending events across reconnects, which would otherwise
// split a single message across two connections).
type CacheEntry = {
  transport: WebSocketChatTransport<UIMessage>;
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
};
const transportCache = new Map<string, CacheEntry>();
const CLOSE_DELAY_MS = 200;

export function acquireTransport(
  url: string,
): WebSocketChatTransport<UIMessage> {
  let entry = transportCache.get(url);
  if (!entry) {
    entry = {
      transport: new WebSocketChatTransport<UIMessage>({ url }),
      refs: 0,
      closeTimer: null,
    };
    transportCache.set(url, entry);
  }
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }
  entry.refs += 1;
  return entry.transport;
}

export function releaseTransport(url: string): void {
  const entry = transportCache.get(url);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.closeTimer = setTimeout(() => {
    entry.transport.close();
    transportCache.delete(url);
  }, CLOSE_DELAY_MS);
}
