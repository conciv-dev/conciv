import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'

import {tanstackStart} from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {nitro} from 'nitro/vite'
import {redact} from '@tanstack/redact/vite'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'react-dom/static.node': '@tanstack/redact/server',
      'react-dom/static': '@tanstack/redact/server',
    },
  },
  plugins: [
    devtools(),
    nitro({rollupConfig: {external: [/^@sentry\//]}}),
    tailwindcss(),
    redact(),
    tanstackStart(),
    viteReact(),
    conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname)}),
  ],
})

export default config
