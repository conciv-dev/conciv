import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'
import conciv from '@conciv/unplugin/vite'

export default defineConfig({
  plugins: [experimental(), conciv()],
  resolve: {alias: {'@conciv/plugin-internal': fileURLToPath(import.meta.resolve('@conciv/plugin-internal'))}},
  define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')},
})
