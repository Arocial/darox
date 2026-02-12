# Nuxt AI Chat Frontend

This is a minimal Nuxt 3 frontend application for an AI chat interface, using the Vercel AI SDK.

## Features

- **Frontend Only**: This template is designed to connect to your own backend API.
- **Streaming Chat**: Implements a streaming chat interface using `useChat` from `@ai-sdk/vue`.
- **Tailwind CSS**: Styled with Tailwind CSS for rapid UI development.

## Setup

1.  Install dependencies:

    ```bash
    pnpm install
    ```

2.  Start the development server:

    ```bash
    pnpm dev
    ```

## Configuration

The chat interface is currently configured to send requests to `/api/use-chat-request`. You will need to update this endpoint in `pages/index.vue` to point to your actual backend service.

```typescript
// pages/index.vue
const chat = new Chat({
  // ...
  transport: new DefaultChatTransport({
    api: 'YOUR_BACKEND_API_URL', // Update this URL
    // ...
  }),
});
```

## Deployment

Build the application for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```
