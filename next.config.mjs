const isProd = process.env.NODE_ENV === 'production';

const internalHost = process.env.TAURI_DEV_HOST;

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ensure Next.js uses SSG instead of SSR
    // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
    output: 'export',
    // Note: This feature is required to use the Next.js Image component in SSG mode.
    // See https://nextjs.org/docs/messages/export-image-api for different workarounds.
    images: {
        unoptimized: true,
    },
    // assetPrefix is only needed for Tauri dev where the webview origin differs from the dev server.
    // When TAURI_DEV_HOST is not set (plain `npm run dev`), omit it so assets load from the current origin.
    assetPrefix: isProd ? undefined : (internalHost ? `http://${internalHost}:3140` : undefined),
};

export default nextConfig;
