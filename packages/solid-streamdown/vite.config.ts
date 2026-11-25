import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({
  plugins: [solid(), concivTest()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/solid-streamdown.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'solid-streamdown.js',
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store'],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
