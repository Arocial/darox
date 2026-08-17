# WebSocket Chat Transport

`components/darox-ui/websocket-chat-transport.ts` implements an AI SDK
`ChatTransport` over the backend's session-node WebSocket endpoint:

```text
/api/sessions/{root_session_id}/nodes/{target_session_id}/ws
```

The connection carries Vercel AI SDK chunks, application commands, session
state, replies, cancellation, and structured commands.

## State bootstrap and recovery

The backend sends a `state` frame first when a connection is established. It
contains committed UI message history and the selected model. The backend then
replays events emitted since that snapshot before streaming live events.

`waitForState()` replaces the former HTTP `/state` request. The agent panel uses
its history to initialize `useChat`, while `ModelPill` subscribes through
`onState()` for the model. Later `state` frames refresh both consumers after the
runtime commits a new snapshot.

Replay can begin before React installs the AI SDK stream controller or command
listener. The transport therefore buffers UI chunks and `cmd-*` frames until
their consumers attach. A new `state` frame resets those pending buffers because
it establishes a newer recovery boundary.

## Frame mapping

| Server frame | Handling |
| --- | --- |
| `state` | Cache and publish committed history/model; not forwarded to AI SDK |
| Vercel AI SDK chunks | Forward to the active AI SDK stream, or buffer until it attaches |
| `cmd-*` | Dispatch to backend-command listeners, or buffer until they attach |
| `cmd-user-message` | Append the backend-pushed user turn and start a new local AI SDK stream |
| `stream-close` | Close the active AI SDK stream |
| `step-done` | Swallow as a backend-only boundary |
| `ack` | Resolve the oldest pending structured command; cancelled acks close the stream |

Client frames are `{ "reply": <UIMessage> }`, `{ "cancel": true }`, or
`{ "command": <event> }`. The transport no longer sends `{ "resume": true }`;
opening the WebSocket initiates snapshot and event replay.

## Connection lifecycle

The backend permits one WebSocket per session node. `acquireTransport(url)` and
`releaseTransport(url)` maintain one ref-counted transport for each node URL so
chat, model selection, and fork commands all reuse the same connection. Opening
a separate one-shot command socket would replace and close the chat socket.

The transport opens lazily through `waitForState()`, `reconnectToStream()`,
`sendMessages()`, or `sendCommand()`. A 200 ms delayed close allows React
StrictMode's unmount/remount cycle to reuse the connection.

AI SDK still uses `resume: true` when the node is active so it calls
`reconnectToStream()` on mount. Here that method creates the local stream sink;
server-side recovery is automatic at WebSocket connection time.

## Limitations

- Only one AI SDK output stream is active at a time. Starting a new one closes
  the previous controller.
- An unexpected socket close errors the active stream and pending state load.
  The transport does not automatically retry; remounting or reloading opens a
  new socket, whose snapshot and cached events restore server state.
- Inactive session nodes reject WebSocket connections, so their history becomes
  available after the runtime is started.

## Files

- `components/darox-ui/websocket-chat-transport.ts` — transport and shared cache.
- `components/darox-ui/agent-tab-panel.tsx` — history bootstrap and chat wiring.
- `components/darox-ui/model-pill.tsx` — model state subscription and switching.
