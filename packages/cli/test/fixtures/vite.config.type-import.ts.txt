import {defineConfig} from 'vite'
import type {ConcivPluginOptions} from '@conciv/it/plugin/vite'

const options: ConcivPluginOptions = {}

export default defineConfig({
  plugins: [],
  define: {options},
})
