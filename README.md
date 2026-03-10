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

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Note on API Integration

By default, the `useChat` hook expects an API route at `/api/chat` to handle the message generation. Since this project only contains the client-side code, you will need to either:

1. Create an API route at `app/api/chat/route.ts` to handle the chat logic.
2. Configure `useChat` to point to an external API endpoint by passing the `api` option:
   ```tsx
   const { messages, input, handleInputChange, handleSubmit } = useChat({
     api: 'https://your-api-endpoint.com/chat'
   });
   ```

## Learn More

- [AI SDK docs](https://ai-sdk.dev/docs)
- [Next.js Documentation](https://nextjs.org/docs)
