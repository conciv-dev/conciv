import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {DevTools} from '../../packages/plugin/node_modules/@vitejs/devtools/dist/index.js'

export default defineConfig({
  plugins: [react(), conciv(), DevTools()],
})
