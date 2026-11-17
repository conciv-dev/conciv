import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'

export default defineConfig({
  publicDir: false,
  plugins: [experimental()],
})
