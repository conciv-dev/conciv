import {defineConfig} from 'vite'
import {concivTest} from './src/test-config.ts'

export default defineConfig({
  plugins: [concivTest()],
})
