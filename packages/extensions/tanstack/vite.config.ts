import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import react from '@vitejs/plugin-react'
import {testHost} from '@conciv/extension-testkit/test-host'

export default defineConfig({
  plugins: [
    solid(),
    testHost({
      root: fileURLToPath(new URL('test/host', import.meta.url)),
      plugins: [react()],
      clientEntry: fileURLToPath(new URL('dist/client.js', import.meta.url)),
    }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: (source) =>
        [/^solid-js/, /^zod/, /^@conciv\//, /^lucide-solid/].some((pattern) => pattern.test(source)),
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
