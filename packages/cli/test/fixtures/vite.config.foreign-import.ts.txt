import {defineConfig} from 'vite'
import {somethingElse} from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [],
  define: {marker: somethingElse},
})
