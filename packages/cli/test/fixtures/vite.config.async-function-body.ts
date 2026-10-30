import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(async function () {
  const port = 5173
  return {
    plugins: [react()],
    server: {port},
  }
})
