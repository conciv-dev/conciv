import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {base} from './vite.base.js'

export default defineConfig({
  plugins: [...base, react()],
})
