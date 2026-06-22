# Coding Agent Instructions

This file provides guidance to coding agents (AI assistants) when working with code in this repository.

## Project Overview

Darox is a chatbot UI built with Next.js (static export) and Electron for cross-platform desktop distribution. It uses the AI SDK for chat and @assistant-ui/react for conversation UI components.

## Commands

```bash
npm run dev           # Next dev server on http://localhost:3140
npm run build:check   # Verification build into .next-check — safe to run while `npm run dev` is live
npm run lint          # Biome check
npm run electron:dev  # Run Next dev + Electron shell together
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
  - `preload.ts` — exposes `window.darox` (`invoke`, `on`, `openDialog`) via `contextBridge`
  - `backend.ts` — spawns the external backend, port discovery, health check, exponential-backoff restart, graceful shutdown
- Dev: `electron:dev` runs Next on 3140 and loads it into a BrowserWindow
- Prod: static export in `/out` is served through a custom `app://` protocol

### Backend (external)

- Chat endpoint: typically dynamic port (e.g., `http://localhost:<port>/api/chat`)
- The backend binary (`arox`) is spawned and managed automatically by the Electron main process.
- **Environment Variables**:
  - `AROX_API_TOKEN`: Overrides the auto-generated Bearer token for API authentication.
  - `DAROX_PORT`: Overrides the auto-generated random port for the backend server.
  
### Component Layers

1. **`/components/ui`** — shadcn/ui Radix primitives. Minimize modifications (third-party origin).
2. **`/components/assistant-ui`** — @assistant-ui conversation components (thread, markdown, attachments, tool-fallback). Minimize modifications (third-party origin).
3. **`/components/darox-ui`** — Custom project components. **Put new components here.**

### Messaging Architecture

Communication with the backend uses a unified WebSocket channel (`WebSocketChatTransport`) that multiplexes two types of data:

1. **AI Generation Stream**: Standard Vercel AI SDK parts (`text-*`, `tool-*`, `finish`) flow directly into the chat thread UI.
2. **Backend Commands (`cmd-*`)**: Application-level instructions pushed from the server. The transport intercepts any frame starting with `cmd-` and dispatches it globally via `useBackendCommands`.
   - `cmd-input-request`: Prompts the UI to render an input form (`ChatInputEventArgs`: normal_input, deferred_tools, exception_input).
   - `cmd-user-turn`: Delivers backend event anchors (`eventId`) mapped to UI `messageId` for forking/branching.
   - `cmd-agent-info`: Broadcasts live subagent state changes, dynamically updating the agent tabs.
   - `stream-close`: Explicit control frame that closes the current AI SDK generation stream independently of business logic.

User replies are JSON-serialized (e.g. `ChatInputEventResult`) and sent back over the same socket.

### State Management

- **Zustand** for component-level state (e.g., attachment handling)
- **React Context** (`ChatInputContext`) for sharing input event args across components
- **localStorage** for command history persistence

### Key Patterns

- `'use client'` on all interactive components
- Path alias: `@/*` maps to project root
- Comments and messages in English by default
