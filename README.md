# Basic Client-Side Chatbot UI

This project is a minimal Next.js application containing only the client-side UI for a basic chatbot using the [AI SDK](https://ai-sdk.dev/docs).

All server-side code and advanced features from the original AI SDK example have been removed to provide a clean starting point for building your own chat interface.

## Features

- Minimal Next.js setup
- Client-side chat UI using `useChat` from `@ai-sdk/react`
- Tailwind CSS for styling

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

2. Run the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

3. Open [http://localhost:3140](http://localhost:3140) with your browser to see the result.

## Note on API Integration

By default, the `useChat` hook expects an API route at `/api/chat` to handle the message generation. Since this project only contains the client-side code, you will need to either:

1. Create an API route at `app/api/chat/route.ts` to handle the chat logic.
2. Configure `useChat` to point to an external API endpoint by passing the `api` option:
   ```tsx
   const { messages, input, handleInputChange, handleSubmit } = useChat({
     api: 'https://your-api-endpoint.com/chat',
   });
   ```

## Integrated development stack

`npm run dev:stack` starts the Next development server, every Arox profile with
`autostart` enabled, and Caddy. Caddy terminates HTTPS, routes each profile
prefix to its backend, and proxies all other requests to Next on
`127.0.0.1:3140`. Next hot reload continues to work through Caddy.

## Desktop backend configuration

The backend binary (`arox`) is spawned and managed automatically by the Electron main process. It reads launch settings from `~/.config/arox/profiles/chat/darox.json` when that file exists:

```json
{
  "apiToken": "replace-with-at-least-32-random-characters",
  "backend": {
    "command": "arox",
    "args": [],
    "host": "127.0.0.1",
    "port": "auto",
    "startupTimeoutMs": 30000
  },
  "profiles": {
    "coder": {
      "args": ["--log-level", "debug"],
      "autostart": true,
      "port": 8201
    }
  },
  "caddy": {
    "domain": "darox.home.arpa",
    "bind": "0.0.0.0",
    "port": 3145
  }
}
```

`command`, `args`, `host`, `port`, and `startupTimeoutMs` can be overridden per
profile. Use `"auto"` to allocate a port automatically for Electron. Profiles
started by `dev:stack` need distinct fixed ports so Caddy has stable upstreams.
The `caddy.port` setting defaults to `3145`. The configured domain must resolve
to this computer, and clients must trust Caddy's local root CA. The development
stack reads `apiToken`, `caddy`, and each profile's `autostart` option; if
`apiToken` is absent, it generates and saves one. Electron reads the same file
without modifying it. `AROX_API_TOKEN` can override the token used by Electron.

## Learn More

- [AI SDK docs](https://ai-sdk.dev/docs)
- [Next.js Documentation](https://nextjs.org/docs)
