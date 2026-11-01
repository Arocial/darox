# Coding Agent Instructions

This file provides guidance to coding agents (AI assistants) when working with code in this repository.

## Project Overview

Darox is a chatbot UI built with Next.js (static export) and Electron for cross-platform desktop distribution. It uses the AI SDK for chat and @assistant-ui/react for conversation UI components.

## Commands

```bash
npm run web:dev           # Next dev server on http://localhost:3140
npm run manager       # Run an independent arox-manager process (default port 3145)
npm test              # Regression tests (Node 22.18+)
npm run build:check   # Verification build into .next-check — safe to run while `npm run web:dev` is live
npm run lint          # Biome check with fixes
npm run electron:dev  # Run Next dev + local Manager + Electron shell together
npm run electron:dir  # Static export + unpacked binary directory (fast, no compression)
npm run electron:fast-run # Launch unpacked binary
npm run electron:build # Static export + electron-builder package
```

**Note:** `npm run web:dev` is often running in the background. Do **not** run `npm run build` to verify changes.
Use `npx tsc --noEmit && npm run lint` instead or `npm run build:check` (isolated to `.next-check/`) if a full build is needed.
`build:check` disables static export and does not refresh `out/` or verify desktop packaging.
`npm run web:static` serves the existing `out/` on 127.0.0.1:3140 (HOST/PORT overrides). Desktop packaging uses `.next-package/` with static export to `out/`, preserving `.next/`. Linux targets `pacman` and portable `tar.gz`; macOS dmg and Windows NSIS remain.

## Architecture

### Frontend

- **Next.js 15** with static export (`output: 'export'`) — no SSR, embedded by Electron
- **React 18** + **TypeScript 5.8**
- **TailwindCSS 4** with HSL CSS variables for theming (light/dark via class)

### Desktop

- **Electron** main process under `/electron` (compiled to `/electron/dist`)
  - `main.ts` — window, IPC handlers, `app://` protocol that serves `/out` in prod
  - `external-links.ts` — opens external HTTP(S) links in the system browser and mail links in the system handler; blocks external navigation and new Electron windows while preserving same-origin app navigation
  - `preload.ts` — exposes `window.darox.openDialog` via `contextBridge`
  - Backend connections and profile lifecycle operations live in the shared frontend.
  - On Linux/macOS Electron reuses the local Manager or spawns detached `arox-manager`
    from the user home directory; exiting never stops it. Windows uses remote Managers.
  - Production HTML responses receive CSP hashes for their inline bootstrap scripts;
    arbitrary inline scripts/eval remain blocked. Production and development use
    separate user-data directories; `DAROX_USER_DATA_DIR` isolates smoke tests.
- Dev: `electron:dev` runs Next on 3140, starts/reuses a local Manager with token `1`,
  and loads the frontend into a BrowserWindow
- Prod: static export in `/out` is served through a custom `app://` protocol

### Backend (external)

- Darox connects to one or more `arox-manager` services; desktop can auto-start a local one.
- Default Manager URL: `http://127.0.0.1:3145`.
- Manager owns profile processes; `manager.toml` in Arox's platform configuration
  directory defines profile ports and autostart settings.
- `AROX_API_TOKEN` configures Manager authentication; users enter the same token
  when adding the connection in Darox.
- The frontend fetches `/api/profiles` on initial load and explicit profile-related
  interactions, then calls profile start/stop/restart APIs as needed.
  HTTP 202 acknowledges an operation; poll for completion and handle HTTP 409.
- Chat API bases are `<manager-url>/api/profiles/<profile>/proxy`. HTTP Bearer
  authentication and WebSocket token queries use the active Manager's token.
- Deleting connections and closing Darox never stop remote processes.

### Component Layers

1. **`/components/ui`** — shadcn/ui Radix primitives. Minimize modifications (third-party origin).
2. **`/components/assistant-ui`** — @assistant-ui conversation components (thread, markdown, attachments, tool-fallback). Minimize modifications (third-party origin).
3. **`/components/darox-ui`** — Custom project components. **Put new components here.**

Markdown in responses and reasoning shares `MarkdownText`. Its plugin configuration
lives in `components/darox-ui/markdown-plugins.ts`: GFM plus `remark-math` and
`rehype-katex` support `$...$` inline math and multiline `$$` blocks. Its
`preprocessMath` also supports `\(...\)` inline and `\[...\]` display math,
while preserving code, HTML, and existing dollar-delimited math. KaTeX CSS
and fonts are bundled locally; display math scrolls horizontally. The npm KaTeX
override keeps parser/rendering dependencies on the same version as its CSS.

### Messaging Architecture

Communication with the backend uses a unified WebSocket channel (`WebSocketChatTransport`) that multiplexes two types of data. Each connection includes a `stream_mode` query parameter:

- `full` streams the complete event sequence.
- `concise` keeps user input, state, and completed output while omitting intermediate model/tool activity.

The global frontend preference is `auto`, `full`, or `concise`. `auto` resolves once at application startup to `concise` for viewports below 768px and `full` otherwise; resize events do not change it. Changing the preference reconnects the visible session node immediately. Other mounted session/subagent connections are released and reconnect lazily when selected.

The channel carries two types of data:

1. **AI Generation Stream**: Standard Vercel AI SDK content parts (`text-*`, `tool-*`, etc.) flow directly into the chat thread UI.
2. **Backend Commands (`cmd-*`)**: Application-level instructions pushed from the server. The transport intercepts any frame starting with `cmd-` and dispatches it globally via `useBackendCommands`.
   - `cmd-turn-state`: Reports the retained turn's busy/idle boundary.
   - `cmd-client-input`: Reports typed client-input lifecycle changes. Its trusted `input_id` persists in snapshots; `client_message_id` is only echoed for newly accepted inputs on the originating connection. Started messages split the visible assistant timeline; accepted commands use a separate command view.
   - `cmd-command-completed`: Completes an accepted command with its status and optional output or error.
   - `cmd-session-tree`: Broadcasts the recursive session tree, dynamically updating the agent tabs.

The selected model is cached per session-node transport. Successful model-change
commands update that cache and notify model subscribers without replaying chat
history; remounted selectors restore the cached model until a newer server snapshot.

User replies are JSON-serialized (e.g. `ChatInputEventResult`) and sent back over the same socket at any time. A started message in `cmd-client-input` clears its pending UI and inserts the echoed user message into the visible timeline, so backend event order defines its placement. An accepted command clears pending UI into a separate command view and is later updated by `cmd-command-completed`; no client-side command detection is required. Inputs submitted while busy influence subsequent output in the same retained turn. Assistant-ui merges consecutive assistant messages for display; commands and compaction markers remain separate and are placed after their containing merged message when their snapshot position falls inside one.

### Long conversation history

`components/darox-ui/thread-history.tsx` window-controls presentation without
trimming runtime messages. Above 20 confirmed user inputs, it folds only complete
10-input sections, retaining the latest 10–19 inputs (33 inputs fold 1–10 and
11–20). During a mounted visit the boundary advances in complete groups only
when the visible viewport is at the bottom and no message is being edited or
navigated to. Returning to the bottom or ending an edit retries deferred folding;
manually expanded sections stay expanded. Each section owns its messages
and the command/compaction markers immediately before those messages; trailing
markers and pending inputs remain outside folded history.

The right-side input directory searches all confirmed user inputs, including
attachment-only inputs, and expands the containing section before navigating.
Navigation suppresses run-start anchoring until the viewport returns to the
bottom. On desktop, multi-agent panels reserve a separate scrollable right sidebar
for the agent list so it cannot cover the input-directory button in the chat area;
mobile keeps the agent selector above the thread. Fold/navigation state is local
to each mounted session-node thread;
remounting restores the default folding rather than persisting it in storage.

### State Management

- **Zustand** for component-level state (e.g., attachment handling)
- **localStorage** for command history, backend configuration, and the global stream-mode preference
- Manager connections are stored as a named list with stable IDs. Profile identities combine Manager ID and profile name. Both browser and Electron restore the selected Manager/profile; remembered tokens for user-added connections use localStorage and session-only tokens use sessionStorage; the injected desktop connection uses the encrypted cache.

### Development services

`npm run electron:dev` starts Next and Electron with `AROX_API_TOKEN=1`.
Electron starts or reuses the local Manager, then injects its connection without
persisting it in browser storage. `AROX_API_TOKEN` overrides and updates the
AES-256-GCM encrypted `manager-token.json` cache (derived from machine and user
identity with `0600` permissions without requiring system keyrings); otherwise
the cache is restored. Saving the injected connection updates this cache.
Occupied ports are never replaced, including authentication failures; startup
errors leave remote connections usable. Logs go to user-data `manager.log`. For browser-only development, run
`npm run web:dev` and `npm run manager` separately. Manager commands require
`arox-manager` on PATH; the standalone shortcut accepts `-- --config <path>` and
inherits the project working directory and shell environment. An optional
`npm run web -- <host[:port]>... [--manager <upstream>]`
script runs Caddy independently, serving HTTP on port 3140 and HTTPS on port
3143 by default with `tls internal` for every required host/IP argument. It
proxies `/api/*` to the configured Manager (default port 3145) and serves
other requests from the static `out/` directory; it never starts Manager. Clients must resolve the supplied host and
trust Caddy's root CA. Use the same HTTPS origin as both the web and Manager URL.
See README for overrides and certificate setup.

### PWA

The root-hosted web app has a static manifest in `public/manifest.webmanifest`
and install icons in `public/icons`, referenced by `app/layout.tsx`. Installation
uses browser UI; there is no service worker or offline cache.

### Key Patterns

- `'use client'` on all interactive components
- Path alias: `@/*` maps to project root
- Comments and messages in English by default
