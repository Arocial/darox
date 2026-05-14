/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export, embedded by Electron in production.
  // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
  output: "export",
  // Allow overriding the build directory via env var so a verification build
  // (e.g. `npm run build:check`) does not clobber the running dev server's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
