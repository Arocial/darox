import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/"))
      return nextResolve(
        new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
        context,
      );
    return nextResolve(specifier, context);
  },
});

const { WebSocketChatTransport, WebSocketConnectionClosedError } = await import(
  "../components/darox-ui/websocket-chat-transport.ts"
);

test("explicit stop cancels a recovered turn while preserving final output and connection", async (t) => {
  const sockets = [];
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    sent = [];
    constructor() {
      sockets.push(this);
      queueMicrotask(() => {
        this.onopen();
        this.receive({ type: "state", history: [], busy: true });
      });
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    receive(frame) {
      this.onmessage({ data: JSON.stringify(frame) });
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
  }
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;
  t.after(() => {
    globalThis.WebSocket = originalWebSocket;
  });
  const transport = new WebSocketChatTransport({ url: "ws://test" });
  t.after(() => transport.close());
  transport.onCommand((frame) => {
    if (frame.type === "cmd-turn-state" && !frame.busy)
      transport.endBusyEpoch();
  });
  const stream = await transport.reconnectToStream({ chatId: "test" });
  const reader = stream.getReader();
  const socket = sockets[0];
  transport.cancelTurn();
  assert.deepEqual(socket.sent, [{ cancel: true }]);

  const finalChunk = { type: "finish", finishReason: "stop" };
  socket.receive(finalChunk);
  socket.receive({ type: "cmd-turn-state", busy: false });
  assert.deepEqual(await reader.read(), { value: finalChunk, done: false });
  assert.equal((await reader.read()).done, true);
  assert.equal(transport.connected, true);

  transport.beginBusyEpoch();
  const nextStream = await transport.reconnectToStream({ chatId: "test" });
  await nextStream.cancel();
  transport.close();
  assert.deepEqual(socket.sent, [{ cancel: true }]);
  assert.throws(() => transport.cancelTurn(), /disconnected/);
  assert.equal(sockets.length, 1);
});

test("ensureOpen waits for pending socket closure before establishing a new connection", async (t) => {
  const sockets = [];
  let finishCloseSocket = null;
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    sent = [];
    constructor() {
      sockets.push(this);
      queueMicrotask(() => {
        this.onopen?.();
        this.onmessage?.({
          data: JSON.stringify({ type: "state", history: [], busy: false }),
        });
      });
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
      finishCloseSocket = () => {
        this.onclose?.({ code: 1000 });
      };
    }
  }
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;
  t.after(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  const transport = new WebSocketChatTransport({ url: "ws://test-closing" });
  t.after(() => transport.close());

  await transport.waitForState();
  assert.equal(sockets.length, 1);
  assert.equal(transport.connected, true);

  // Initiate close with deferred onclose callback
  transport.close();
  assert.equal(transport.connected, false);

  // Calling waitForState while close is in progress should not create a second socket immediately
  const statePromise = transport.waitForState();
  assert.equal(sockets.length, 1);

  // Complete previous socket closure
  assert.notEqual(finishCloseSocket, null);
  finishCloseSocket();

  const state = await statePromise;
  assert.equal(sockets.length, 2);
  assert.deepEqual(state.history, []);
  assert.equal(transport.connected, true);
});

test("unexpected disconnect rejects pending state with a recoverable error", async (t) => {
  const sockets = [];
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    constructor() {
      sockets.push(this);
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    receive(frame) {
      this.onmessage?.({ data: JSON.stringify(frame) });
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1006 });
    }
  }
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;
  t.after(() => {
    globalThis.WebSocket = originalWebSocket;
  });
  const transport = new WebSocketChatTransport({ url: "ws://test-recovery" });
  t.after(() => transport.close());

  const opening = transport.waitForState();
  sockets[0].close();
  await assert.rejects(opening, WebSocketConnectionClosedError);

  const waiting = transport.waitForState();
  sockets[1].open();
  await new Promise((resolve) => setImmediate(resolve));
  sockets[1].close();
  await assert.rejects(waiting, WebSocketConnectionClosedError);

  const recovered = transport.waitForState();
  sockets[2].open();
  sockets[2].receive({ type: "state", history: [], busy: false });
  assert.deepEqual((await recovered).history, []);
});
