import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {testHost} from '@conciv/extension-testkit/test-host'

export default defineConfig({
  plugins: [
    solid(),
    testHost({clientEntry: fileURLToPath(new URL('test/fixture/connect-pane-fixture.tsx', import.meta.url))}),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^lucide-solid/],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
