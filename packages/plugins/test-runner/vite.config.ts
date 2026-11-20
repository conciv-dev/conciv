import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'
import conciv from '@conciv/unplugin/vite'

export default defineConfig({
  publicDir: false,
  plugins: [experimental(), conciv()],
  resolve: {alias: {'@conciv/plugin-internal': fileURLToPath(import.meta.resolve('@conciv/plugin-internal'))}},
})
