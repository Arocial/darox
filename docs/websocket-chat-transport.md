# WebSocket Chat Transport

`components/darox-ui/websocket-chat-transport.ts` implements an AI SDK
`ChatTransport` over the backend's session-node WebSocket endpoint:

```text
/api/sessions/{root_session_id}/nodes/{target_session_id}/ws?stream_mode={full|concise}
```

`full` streams the complete event sequence. `concise` retains user input,
state, and completed output while omitting intermediate model and tool events.

The connection carries Vercel AI SDK chunks, application commands, session
state, replies, cancellation, and structured commands.

## State bootstrap and recovery

The backend sends a `state` frame first when a connection is established. It
contains one ordered discriminated history of UI messages, completed commands,
and compaction markers, plus the selected model and the retained turn's current
`busy` state. The backend then replays events emitted since that snapshot before
streaming live events.

`waitForState()` replaces the former HTTP `/state` request. The agent panel uses
its history to initialize `useChat`, while `ModelPill` subscribes through
`onState()` for the model. Later `state` frames refresh both consumers after the
runtime commits a new snapshot.

Replay can begin before React installs the AI SDK stream controller or timeline
listener. The transport therefore buffers UI chunks, `cmd-*` frames, and live
compaction markers until their consumers attach. A new `state` frame resets
those pending buffers because it establishes a newer recovery boundary.

## Frame mapping

| Server frame | Handling |
| --- | --- |
| `state` | Cache and publish committed history/model/busy state; render commands and compaction markers outside the AI SDK message list |
| Vercel AI SDK chunks | Forward to the active AI SDK stream, or buffer until it attaches |
| `cmd-*` | Dispatch to backend-command listeners, or buffer until they attach |
| `compaction` | Dispatch a live compaction marker outside the AI SDK stream |
| `cmd-client-input` with a started message payload | Establish the canonical user-message timeline boundary: flush the preceding assistant segment, append the echoed user turn, and attach a fresh AI SDK sink for later output |
| `cmd-client-input` with an accepted command payload | Move pending input into the separate command view without touching the AI SDK stream |
| `cmd-command-completed` | Update the matching command by `input_id` and resolve callers waiting for its result |
| `cmd-turn-state` | Start/end the retained turn's reading epoch and publish busy/idle state for title and completion UI |

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

The global stream preference is persisted as `auto`, `full`, or `concise`.
`auto` resolves once at application startup: viewports below 768px use
`concise`, and wider viewports use `full`. Resizing does not change the resolved
mode. A preference change reconnects the visible session node immediately;
other mounted session and subagent sockets are released, then reconnect with
the new mode only when selected.

The agent panel calls `resumeStream()` through a single-flight wrapper after
state and buffered commands have been applied. A live started message in `cmd-client-input`
flushes and closes the preceding sink, waits for AI SDK update jobs to settle,
appends the echoed user message, and then attaches the next sink. Chunks that
arrive during that handoff stay buffered in the transport.

User input remains enabled while a retained turn is busy. The composer sends a
reply without optimistically appending it or creating another response stream.
The matching typed `cmd-client-input` lifecycle event clears pending UI. The
backend's started message payload remains the single source of truth for
inserting a user message into the visible timeline: it closes the preceding AI
SDK assistant segment and starts another on the same WebSocket, while
`cmd-turn-state busy=false` closes the final segment.

This deliberately separates the retained-turn stream from AI SDK message
streams: one busy epoch may contain multiple short assistant segments separated
by echoed user inputs, but it uses one persistent WebSocket connection.

## Backend ordering contract

- Send `cmd-turn-state busy=true` before output for a retained turn.
- Treat a started message payload in `cmd-client-input` as an ordered barrier: preceding assistant chunks
  belong above that user message and later chunks belong below it.
- Send `cmd-turn-state busy=false` only after the final output chunk.
- Echo the connection-local `client_message_id` and trusted `input_id` for a
  newly accepted client input. Replayed inputs contain only `input_id`; user
  message metadata carries that same value as `user_input_id` for fork anchors.
- `finish`, `stream-close`, and `step-done` are not needed by this frontend.

## Limitations

- The backend must send started message payloads in timeline order: all chunks for the
  preceding assistant segment before it, and all chunks affected by that input
  after it.
- `cmd-turn-state busy=false` must be ordered after the final output chunk.
- An unexpected socket close errors the active stream and pending state load.
  The transport does not automatically retry; remounting or reloading opens a
  new socket, whose snapshot and cached events restore server state.
- Saved inactive nodes can be connected; submitting input starts their runtime
  lazily.

## Files

- `components/darox-ui/websocket-chat-transport.ts` — transport and shared cache.
- `components/darox-ui/stream-mode-store.ts` — persisted preference and startup-only auto detection.
- `components/darox-ui/agent-tab-panel.tsx` — history bootstrap, chat wiring, and lazy mode reconnection.
- `components/darox-ui/model-pill.tsx` — model state subscription and switching.
