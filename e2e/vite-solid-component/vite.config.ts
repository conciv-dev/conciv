import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [solid(), conciv({widget: false})],
})
