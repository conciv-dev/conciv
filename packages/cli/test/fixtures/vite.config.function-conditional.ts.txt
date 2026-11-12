import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({mode}) => {
  if (mode === 'test') return {plugins: []}
  return {plugins: [react()]}
})
