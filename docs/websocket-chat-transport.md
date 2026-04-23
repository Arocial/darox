# WebSocket Chat Transport

`components/darox-ui/websocket-chat-transport.ts` implements an AI SDK `ChatTransport` backed by the backend's full-duplex WebSocket endpoint (`/api/composers/{composer_id}/agents/{agent_name}/ws`). It replaces the default HTTP `AssistantChatTransport` used by `useChatRuntime` while keeping all upper-layer assistant-ui components (`Thread`, message rendering, composer, `onData`) untouched.

## Why a custom transport

The backend WS endpoint is long-lived and decouples input from output: events flow from server to client continuously, and the client may submit replies or cancel requests at any time. The default HTTP transport is request–response: each `sendMessages` call opens a fresh SSE stream and closes it when the server finishes. Mapping the WS model onto that shape loses the "server-pushed before first user input" case and forces one output stream per user turn.

By replacing only the transport, we reuse the entire assistant-ui runtime stack and only bridge the protocol at the lowest layer.

## Architecture

### Layers

```
┌────────────────────────────────────────────┐
│ Thread / MessagePrimitive / Composer (UI)  │
├────────────────────────────────────────────┤
│ useChatRuntime  →  useChat  →  Chat        │  assistant-ui + @ai-sdk/react
├────────────────────────────────────────────┤
│ ChatTransport interface                    │
│   sendMessages() / reconnectToStream()     │
├────────────────────────────────────────────┤
│ WebSocketChatTransport                     │  ← this module
├────────────────────────────────────────────┤
│ WebSocket (native)                         │
└────────────────────────────────────────────┘
```

### Frame mapping

Server → client frames are forwarded as AI SDK `UIMessageChunk` objects with only two exceptions:

| Backend frame | Handling |
|-------------------------|-------------------------------------------------------|
| `text-*`, `reasoning-*` | forwarded 1:1 |
| `tool-*` | forwarded 1:1 |
| `finish`, `start-step`, `finish-step` | forwarded 1:1 |
| `data-input-request` | forwarded as `data-input-request` data chunk, then current stream is **closed** |
| `step-done` | swallowed (backend-specific boundary, no UI meaning) |
| `ack` | swallowed; `status === "cancelled"` closes the stream |

Client → server frames:

| Trigger | Frame sent |
|---------------------------------------------|-----------------------------------|
| Runtime calls `sendMessages` with a user msg | `{ "reply": <ChatInputEventResult> }` |
| Runtime's `AbortSignal` fires | `{ "cancel": true }` |

The user message's text is already a JSON-serialized `ChatInputEventResult` (produced by `components/darox-ui/composer.tsx`), so the transport only has to parse and forward it. Plain-text fallback is preserved for robustness.

### Connection lifecycle

One WebSocket instance per `(apiBase, composerId, agentName)` triple.

- **Open**: lazily on first `reconnectToStream` or `sendMessages`. The runtime is configured with `resume: true`, so assistant-ui calls `reconnectToStream` on mount, which opens the WS before any user input.
- **Reuse**: multiple `sendMessages` calls share the same WS. Each call creates a fresh `ReadableStream<UIMessageChunk>`; the previous one is closed first if still open.
- **Close**: on explicit `transport.close()` or when the remote peer closes. Any live stream is errored on unexpected close.

### Module-level transport cache

`acquireTransport(url)` / `releaseTransport(url)` implement ref-counted caching keyed by WS URL. The release path schedules `close()` after a 200 ms delay; a subsequent `acquire` within that window cancels the close and reuses the same instance.

This exists to tolerate React StrictMode's mount → unmount → mount sequence in development. Without it, the component would briefly drop the WS between the two mounts. The backend does not buffer pending events across reconnects, so a message split across the drop (e.g. `text-start` on connection 1, `text-end` on connection 2) would render incorrectly.

### Stream ↔ turn correspondence

The AI SDK `Chat` keeps a status machine (`submitted` / `streaming` / `ready`) tied to a single active output stream. The transport maintains this by allowing at most one live stream controller at a time:

1. `reconnectToStream` (via `resume: true`) returns the **initial** stream.  It receives everything the server emits until `data-input-request`.
2. On `data-input-request`, the stream is closed → status goes `ready` → composer becomes interactive.
3. User submits → `sendMessages` sends `{reply}` over the **same** WS and returns a **new** stream for the next turn's events.
4. Repeat from (2).

## Capabilities

- **Server-initiated output before any user input.** Welcome messages and pre-prompt autonomous activity render as soon as the WS connects.
- **Multi-step turns per user reply.** Between `data-input-request`s the backend may emit multiple `finish`-delimited assistant messages and tool interactions. All flow through the single active stream.
- **Zero changes above the transport layer.** `Thread`, `onData` for `data-input-request`, composer state (`ChatInputContext`), command history, attachment handling, and the existing `ChatInputEventResult` serialization all work unchanged.
- **Cancellation.** The runtime's stop button → `AbortSignal` → client sends `{"cancel": true}`; server `ack:cancelled` closes the stream.
- **History loading unchanged.** Initial messages are still fetched via the HTTP `/history` endpoint and passed to `useChatRuntime` as `messages`; the transport is stream-only.

## Limitations

- **One active stream at a time.** AI SDK's status machine accepts only one stream in flight per chat. The transport enforces this by closing any prior controller when a new stream starts. True concurrent input-while-streaming (user typing a new message before the current assistant output finishes) still follows the standard "abort then reply" pattern; it is not free-form full-duplex at the UI level.
- **No reconnect resilience.** If the WS drops unexpectedly, the current stream is errored and no automatic retry is performed. A reload re-establishes the connection. (Backends that buffer events across reconnects could be supported with a session resume token.)
- **Event splitting across reconnects is unsafe.** The backend does not carry pending events across connections, so partial messages can be lost if the WS is replaced mid-stream. The StrictMode cache exists specifically to avoid this in development; production code paths must similarly avoid rapid acquire/release churn.
- **`reconnectToStream` returns a fresh sink, not a true resume.** The transport has no server-side session ID to resume from, so the implementation simply opens the WS (if needed) and returns a new stream. Events missed while disconnected are lost.
- **Single-user-message serialization contract.** The transport expects the last user message's first text part to be a JSON-encoded `ChatInputEventResult`. Any upstream change to how the composer encodes input must keep this contract or the transport's fallback path (treat as plain `user_input`) will be used.
- **No `prepareSendMessagesRequest` hook.** Unlike `AssistantChatTransport`, this transport does not forward runtime model context (tools JSON schema, system prompt, callSettings) to the server — the backend owns that state for WS sessions.

## Files

- `components/darox-ui/websocket-chat-transport.ts` — transport, `httpBaseToWsUrl`, `acquireTransport`, `releaseTransport`.
- `components/darox-ui/composer-tab-panel.tsx` — wires transport into `useChatRuntime` with `resume: true` and manages acquire/release in the component lifecycle.
