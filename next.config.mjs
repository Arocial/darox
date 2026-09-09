/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export, embedded by Electron in production.
  // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
  output: process.env.NEXT_DIST_DIR ? undefined : "export",
  // Allow overriding the build directory via env var so a verification build
  // (e.g. `npm run build:check`) does not clobber the running dev server's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: process.env.DAROX_DEV_HOST
    ? [process.env.DAROX_DEV_HOST]
    : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
