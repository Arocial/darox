# Coding Agent Instructions

This file provides guidance to coding agents (AI assistants) when working with code in this repository.

## Project Overview

Darox is a chatbot UI built with Next.js (static export) and Tauri for cross-platform desktop distribution. It uses the AI SDK for chat and @assistant-ui/react for conversation UI components.

## Commands

```bash
npm run dev        # Dev server on http://localhost:3140
npm run build      # Next.js static build (output to /out for Tauri)
npm run lint       # ESLint
npm run tauri      # Tauri CLI (e.g., npm run tauri dev, npm run tauri build)
```

Use `npm` as the package manager.

## Architecture

### Frontend
- **Next.js 15** with static export (`output: 'export'`) — no SSR, built for Tauri embedding
- **React 18** + **TypeScript 5.8**
- **TailwindCSS 4** with HSL CSS variables for theming (light/dark via class)

### Desktop
- **Tauri 2** wraps the static export from `/out`
- Dev server runs on port 3140; Tauri's `beforeDevCommand` runs `npm run dev`

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
