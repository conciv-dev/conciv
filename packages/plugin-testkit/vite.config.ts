import {defineConfig} from 'vite'
import {concivTest} from './src/vitest.ts'

export default defineConfig({
  plugins: [concivTest()],
})
