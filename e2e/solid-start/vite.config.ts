import {defineConfig} from 'vite'
import {nitroV2Plugin as nitro} from '@solidjs/vite-plugin-nitro-2'

import {solidStart} from '@solidjs/start/config'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [solidStart({solid: {exclude: /\/packages\/.*\/dist\//}}), nitro(), conciv()],
})
