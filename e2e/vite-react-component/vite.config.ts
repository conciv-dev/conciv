import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), conciv({widget: false})],
})
