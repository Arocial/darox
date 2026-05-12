# Coding Agent Instructions

This file provides guidance to coding agents (AI assistants) when working with code in this repository.

## Project Overview

Darox is a chatbot UI built with Next.js (static export) and Electron for cross-platform desktop distribution. It uses the AI SDK for chat and @assistant-ui/react for conversation UI components.

## Commands

```bash
npm run dev           # Next dev server on http://localhost:3140
npm run build:check   # Verification build into .next-check — safe to run while `npm run dev` is live
npm run lint          # ESLint
npm run electron:dev  # Run Next dev + Electron shell together
npm run electron:build # Static export + electron-builder package
```

**Note:** `npm run dev` is often running in the background. Do **not** run `npm run build` to verify changes.
Use `npx tsc --noEmit && npm run lint` instead or  `npm run build:check` (isolated to `.next-check/`) if a full build is needed.

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
- Chat endpoint: `http://localhost:8000/api/chat`
- Suggestions endpoint: `http://localhost:8000/api/suggestions`
- The backend is not part of this repo

### Component Layers

1. **`/components/ui`** — shadcn/ui Radix primitives. Minimize modifications (third-party origin).
2. **`/components/assistant-ui`** — @assistant-ui conversation components (thread, markdown, attachments, tool-fallback). Minimize modifications (third-party origin).
3. **`/components/darox-ui`** — Custom project components. **Put new components here.**

### Chat Data Flow

The app uses `ChatInputEventArgs` (defined in `app/page.tsx`) to handle three input modes:
- `normal_input` — standard user messages
- `deferred_tools` — interactive tool question responses (tool ID → answer mapping)
- `exception_input` — error handling with continue/stop

User input is JSON-serialized as `ChatInputEventResult` and sent via `AssistantChatTransport` to the backend.

### State Management
- **Zustand** for component-level state (e.g., attachment handling)
- **React Context** (`ChatInputContext`) for sharing input event args across components
- **localStorage** for command history persistence

### Key Patterns
- `'use client'` on all interactive components
- Path alias: `@/*` maps to project root
- Comments and messages in English by default
