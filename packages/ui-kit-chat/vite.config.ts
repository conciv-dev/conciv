import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
        tools: fileURLToPath(new URL('src/tools.tsx', import.meta.url)),
        'theme/fonts': fileURLToPath(new URL('src/theme/fonts.ts', import.meta.url)),
        'theme/code-theme': fileURLToPath(new URL('src/theme/code-theme.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@tanstack\//, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
