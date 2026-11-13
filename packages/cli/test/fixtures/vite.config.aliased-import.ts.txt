import {defineConfig} from 'vite'
import {somethingElse as conciv} from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [conciv()],
})
