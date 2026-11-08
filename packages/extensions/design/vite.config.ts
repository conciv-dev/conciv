import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {addSourceToJsx} from '@conciv/extension-compiler/inject-source'

const root = fileURLToPath(new URL('../../..', import.meta.url))

export default defineConfig({
  plugins: [
    {
      name: 'conciv-design-keys',
      enforce: 'pre',
      transform: (code, id) => addSourceToJsx({code, id, root, persist: true}),
    },
    solid(),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: (source) =>
        !source.includes('.css') &&
        [
          /^solid-js/,
          /^zod/,
          /^@conciv\//,
          /^lucide-solid/,
          /^rrweb($|\/)/,
          /^rrweb-player($|\/)/,
          /^@rrweb\//,
          /^@tanstack\//,
          /^@orpc\//,
          /^@zumer\//,
          /^@bramus\//,
        ].some((pattern) => pattern.test(source)),
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
