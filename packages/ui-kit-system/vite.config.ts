import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {
        'ui-kit-system': fileURLToPath(new URL('src/ui-kit-system.tsx', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^@ark-ui\//, /^lucide-solid/, /^@conciv\//, /^@tanstack\/solid-hotkeys/],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
