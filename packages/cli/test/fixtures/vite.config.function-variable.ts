import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const shared = {plugins: [react()]}

export default defineConfig(() => shared)
