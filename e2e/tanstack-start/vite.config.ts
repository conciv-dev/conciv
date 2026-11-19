import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'

import {tanstackStart} from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {nitro} from 'nitro/vite'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'

const tanstackPlugin = fileURLToPath(new URL('.', import.meta.resolve('@conciv/plugin-tanstack/package.json')))

const config = defineConfig({
  resolve: {tsconfigPaths: true},
  plugins: [
    devtools(),
    nitro({rollupConfig: {external: [/^@sentry\//]}}),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname), plugins: [tanstackPlugin]}),
  ],
})

export default config
