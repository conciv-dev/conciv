import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  root: fileURLToPath(new URL('test/fixtures/host', import.meta.url)),
  plugins: [solid()],
  define: {'process.env.NODE_ENV': '"development"'},
  build: {
    outDir: fileURLToPath(new URL('test/dist', import.meta.url)),
    emptyOutDir: true,
    minify: false,
  },
})
