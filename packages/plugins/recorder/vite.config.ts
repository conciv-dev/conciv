import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'

export default defineConfig({
  plugins: [experimental()],
  resolve: {alias: {'@conciv/plugin-internal': fileURLToPath(import.meta.resolve('@conciv/plugin-internal'))}},
})
