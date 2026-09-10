# Coding Agent Instructions

This file provides guidance to coding agents (AI assistants) when working with code in this repository.

## Project Overview

Darox is a chatbot UI built with Next.js (static export) and Electron for cross-platform desktop distribution. It uses the AI SDK for chat and @assistant-ui/react for conversation UI components.

## Commands

```bash
npm run dev           # Next dev server on http://localhost:3140
npm run manager       # Run an independent arox-manager process (default port 3145)
npm test              # Manager client/store regression tests (Node 22.18+)
npm run build:check   # Verification build into .next-check — safe to run while `npm run dev` is live
npm run lint          # Biome check
npm run electron:dev  # Run Next dev + local Manager + Electron shell together
npm run electron:build # Static export + electron-builder package
```

**Note:** `npm run dev` is often running in the background. Do **not** run `npm run build` to verify changes.
Use `npx tsc --noEmit && npm run lint` instead or `npm run build:check` (isolated to `.next-check/`) if a full build is needed.

## Architecture

### Frontend

- **Next.js 15** with static export (`output: 'export'`) — no SSR, embedded by Electron
- **React 18** + **TypeScript 5.8**
- **TailwindCSS 4** with HSL CSS variables for theming (light/dark via class)

### Desktop

- **Electron** main process under `/electron` (compiled to `/electron/dist`)
  - `main.ts` — window, IPC handlers, `app://` protocol that serves `/out` in prod
  - `preload.ts` — exposes `window.darox.openDialog` via `contextBridge`
  - Backend connections and profile lifecycle operations live in the shared frontend; Electron never starts or stops Manager processes.
- Dev: `electron:dev` runs Next on 3140, starts a local Manager with token `1`,
  and loads the frontend into a BrowserWindow
- Prod: static export in `/out` is served through a custom `app://` protocol

### Backend (external)

- Darox connects to one or more independently running `arox-manager` services.
- Default Manager URL: `http://127.0.0.1:3145`.
- Manager owns profile processes; `manager.toml` in Arox's platform configuration
  directory defines profile ports and autostart settings.
- `AROX_API_TOKEN` configures Manager authentication; users enter the same token
  when adding the connection in Darox.
- The frontend polls `/api/profiles` and calls profile start/stop/restart APIs.
  HTTP 202 acknowledges an operation; poll for completion and handle HTTP 409.
- Chat API bases are `<manager-url>/api/profiles/<profile>/proxy`. HTTP Bearer
  authentication and WebSocket token queries use the active Manager's token.
- Deleting connections and closing Darox never stop remote processes.

### Component Layers

1. **`/components/ui`** — shadcn/ui Radix primitives. Minimize modifications (third-party origin).
2. **`/components/assistant-ui`** — @assistant-ui conversation components (thread, markdown, attachments, tool-fallback). Minimize modifications (third-party origin).
3. **`/components/darox-ui`** — Custom project components. **Put new components here.**

### Messaging Architecture

Communication with the backend uses a unified WebSocket channel (`WebSocketChatTransport`) that multiplexes two types of data. Each connection includes a `stream_mode` query parameter:

- `full` streams the complete event sequence.
- `concise` keeps user input, state, and completed output while omitting intermediate model/tool activity.

The global frontend preference is `auto`, `full`, or `concise`. `auto` resolves once at application startup to `concise` for viewports below 768px and `full` otherwise; resize events do not change it. Changing the preference reconnects the visible session node immediately. Other mounted session/subagent connections are released and reconnect lazily when selected.

The channel carries two types of data:

1. **AI Generation Stream**: Standard Vercel AI SDK content parts (`text-*`, `tool-*`, etc.) flow directly into the chat thread UI.
2. **Backend Commands (`cmd-*`)**: Application-level instructions pushed from the server. The transport intercepts any frame starting with `cmd-` and dispatches it globally via `useBackendCommands`.
   - `cmd-turn-state`: Reports the retained turn's busy/idle boundary.
   - `cmd-client-input`: Reports typed client-input lifecycle changes. Started messages split the visible assistant timeline; accepted commands use a separate command view.
   - `cmd-command-completed`: Completes an accepted command with its status and optional output or error.
   - `cmd-session-tree`: Broadcasts the recursive session tree, dynamically updating the agent tabs.

User replies are JSON-serialized (e.g. `ChatInputEventResult`) and sent back over the same socket at any time. A started message in `cmd-client-input` clears its pending UI and inserts the echoed user message into the visible timeline, so backend event order defines its placement. An accepted command clears pending UI into a separate command view and is later updated by `cmd-command-completed`; no client-side command detection is required. Inputs submitted while busy influence subsequent output in the same retained turn.

### State Management

- **Zustand** for component-level state (e.g., attachment handling)
- **localStorage** for command history, backend configuration, and the global stream-mode preference
- Manager connections are stored as a named list with stable IDs. Profile identities combine Manager ID and profile name. Both browser and Electron restore the selected Manager/profile; remembered tokens use localStorage and session-only tokens use sessionStorage.

### Development services

`npm run electron:dev` starts Next, a local Manager with `AROX_API_TOKEN=1`, and
the Electron shell. The shell injects that Manager connection into the frontend
without persisting it in browser storage. For browser-only development, run
`npm run dev` and `npm run manager` separately. Manager commands require
`arox-manager` on PATH; the standalone shortcut accepts `-- --config <path>` and
inherits the project working directory and shell environment. Caddy is no longer
part of Darox.

### Key Patterns

- `'use client'` on all interactive components
- Path alias: `@/*` maps to project root
- Comments and messages in English by default
