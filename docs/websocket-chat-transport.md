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
contains committed UI message history, the selected model, and the retained
turn's current `busy` state. The backend then replays events emitted since that
snapshot before streaming live events.

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
| `state` | Cache and publish committed history/model/busy state; not forwarded to AI SDK |
| Vercel AI SDK chunks | Forward to the active AI SDK stream, or buffer until it attaches |
| `cmd-*` | Dispatch to backend-command listeners, or buffer until they attach |
| `cmd-user-message` | Deduplicate against a local turn using the optional top-level `client_message_id`, otherwise append the backend-pushed user turn, then start a new local AI SDK stream |
| `finish` | Finish the current assistant message and advance to the next queued AI SDK stream |
| `cmd-turn-state` | Publish the retained turn's busy/idle boundary for title and attention UI |
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

The agent panel calls `resumeStream()` through a single-flight wrapper after
state and buffered commands have been applied. A live `cmd-user-message` uses
the same wrapper to start its generation stream. An already attached recovery
sink remains open for that generation; if it is in the process of settling, a
new resume is queued behind it. This avoids a controller gap that would leave
live chunks buffered without reaching the UI.

User input remains enabled while a retained turn is busy. Each additional
`sendMessages()` stream waits in FIFO order while the backend queues its input;
the WebSocket itself remains connected across every turn.

## Limitations

- AI SDK output streams are matched to sequential backend inference results by
  FIFO order; the backend must not interleave inference chunks.
- An unexpected socket close errors the active stream and pending state load.
  The transport does not automatically retry; remounting or reloading opens a
  new socket, whose snapshot and cached events restore server state.
- Inactive session nodes reject WebSocket connections, so their history becomes
  available after the runtime is started.

## Files

- `components/darox-ui/websocket-chat-transport.ts` — transport and shared cache.
- `components/darox-ui/agent-tab-panel.tsx` — history bootstrap and chat wiring.
- `components/darox-ui/model-pill.tsx` — model state subscription and switching.
