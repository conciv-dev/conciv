import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [react(), conciv({harness: 'pi'})],
})
