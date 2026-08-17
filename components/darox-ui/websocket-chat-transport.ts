import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

type WsServerFrame =
  | { type: "ack"; status: string }
  | { type: "state"; history: UIMessage[]; model: string | null }
  | { type: "step-done" }
  | { type: "data-input-request"; data: unknown }
  | ({ type: string } & Record<string, unknown>);

export type BackendCommand = {
  type: string;
  [key: string]: unknown;
};

export type CommandListener = (cmd: BackendCommand) => void;

export type SessionState = {
  history: UIMessage[];
  model: string | null;
};

export type StateListener = (state: SessionState) => void;

export type AgentCommandAck = {
  status: string;
  output?: string;
};

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
  private streamCompleted = false;
  private pendingChunks: UIMessageChunk[] = [];
  private abortCleanup: (() => void) | null = null;
  // FIFO of resolvers awaiting an ack for a sent command. Acks are 1:1 with
  // client-sent frames per the API contract.
  private commandAckQueue: Array<
    (ack: { status: string; output?: string }) => void
  > = [];
  // Listeners for backend-initiated one-shot commands
  private commandListeners: Set<CommandListener> = new Set();
  private pendingCommands: BackendCommand[] = [];
  private stateListeners: Set<StateListener> = new Set();
  private latestState: SessionState | null = null;
  private stateWaiters: Array<{
    resolve: (state: SessionState) => void;
    reject: (error: Error) => void;
  }> = [];

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
      this.latestState = null;
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => {
        // onclose will follow — let it handle reject + cleanup
      };
      ws.onclose = () => {
        const wasOpening = this.openPromise;
        this.ws = null;
        this.openPromise = null;
        const error = new Error("WebSocket connection closed");
        if (wasOpening) reject(error);
        for (const waiter of this.stateWaiters.splice(0)) waiter.reject(error);
        this.failController(error);
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
    return this.openPromise;
  }

  public onCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    for (const command of this.pendingCommands.splice(0)) listener(command);
    return () => {
      this.commandListeners.delete(listener);
    };
  }

  public onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    if (this.latestState) listener(this.latestState);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public async waitForState(): Promise<SessionState> {
    await this.ensureOpen();
    if (this.latestState) return this.latestState;
    return new Promise<SessionState>((resolve, reject) => {
      this.stateWaiters.push({ resolve, reject });
    });
  }

  private enqueue(chunk: UIMessageChunk) {
    if (this.controller && !this.controllerClosed) {
      try {
        this.controller.enqueue(chunk);
      } catch {
        this.controllerClosed = true;
      }
    } else {
      this.pendingChunks.push(chunk);
    }
  }

  private attachController(
    controller: ReadableStreamDefaultController<UIMessageChunk>,
  ) {
    this.controller = controller;
    this.controllerClosed = false;
    for (const chunk of this.pendingChunks.splice(0)) {
      this.enqueue(chunk);
    }
  }

  private handleStreamClose() {
    this.streamCompleted = true;
    this.pendingChunks = [];
    this.closeController();
  }

  private hasCompletedStream() {
    return this.streamCompleted;
  }

  /**
   * Mark a backend-pushed user message as the start of a new generation.
   * Unlike sendMessages(), this does not send a reply frame: the backend has
   * already accepted the user turn and will push its AI SDK chunks next.
   */
  public beginServerStream() {
    this.streamCompleted = false;
    if (this.controller && !this.controllerClosed) {
      this.closeController();
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
      if (this.commandListeners.size === 0) {
        this.pendingCommands.push(command);
        return;
      }
      this.commandListeners.forEach((listener) => {
        listener(command);
      });
      return;
    }

    switch (msg.type) {
      case "state": {
        const frame = msg as { history?: unknown; model?: unknown };
        const state: SessionState = {
          history: Array.isArray(frame.history)
            ? (frame.history as UIMessage[])
            : [],
          model: typeof frame.model === "string" ? frame.model : null,
        };
        this.pendingChunks = [];
        this.pendingCommands = [];
        this.latestState = state;
        for (const waiter of this.stateWaiters.splice(0)) waiter.resolve(state);
        this.stateListeners.forEach((listener) => {
          listener(state);
        });
        return;
      }
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
        this.handleStreamClose();
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
    // An explicit user reply starts a new stream, so a close remembered from
    // the previous server-pushed stream no longer applies.
    this.streamCompleted = false;

    // Close any prior stream (defensive — runtime should not overlap).
    if (this.controller && !this.controllerClosed) {
      this.closeController();
    }

    const stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.attachController(controller);
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
  }): Promise<AgentCommandAck> {
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
      if (this.hasCompletedStream()) return null;

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
      if (this.hasCompletedStream()) return null;

      const stream = new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          this.attachController(controller);
        },
        cancel: () => {
          this.controller = null;
          this.controllerClosed = true;
        },
      });
      return stream;
    };

  close() {
    const ws = this.ws;
    this.ws = null;
    this.openPromise = null;
    this.streamCompleted = false;
    this.closeController();

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
  rootSessionId: string,
  targetSessionId: string,
): string {
  const wsBase = apiBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return appendWsToken(
    `${wsBase}/api/sessions/${rootSessionId}/nodes/${targetSessionId}/ws`,
  );
}

// Module-level cache keyed by URL. It enforces the backend's one-WebSocket-per
// session-node contract and lets StrictMode's unmount→remount reuse the same
// connection instead of needlessly replacing it.
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
