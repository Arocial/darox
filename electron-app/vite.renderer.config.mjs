import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vitejs.dev/config
export default defineConfig({
   base: './',
   images: {
      unoptimized: true,
   },
   plugins: [
    viteStaticCopy({
      targets: [
        {
          src: '../renderer/out/**/*',
          dest: '.'
        },
      ]
    })
  ]
});
