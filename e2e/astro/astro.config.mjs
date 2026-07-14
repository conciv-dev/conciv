// @ts-check
import {defineConfig} from 'astro/config'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  vite: {
    plugins: [conciv()],
  },
})
