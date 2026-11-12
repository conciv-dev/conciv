import {defineConfig} from 'vite'

const metadata = {plugins: []}

export default defineConfig({
  server: {port: 3000},
})

export const name = metadata
