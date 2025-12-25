import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config
export default defineConfig({
  base: "./",
  images: {
    unoptimized: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "../renderer/.next/standalone/",
          dest: ".",
        },
        {
          src: "../renderer/.next/static/",
          dest: "standalone/.next",
        },
        {
          src: "../renderer/public/",
          dest: "standalone/",
        },
      ],
    }),
  ],
});
