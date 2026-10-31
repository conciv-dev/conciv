import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'

import {tanstackStart} from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {nitro} from 'nitro/vite'
import {redact} from '@tanstack/redact/vite'
import conciv from '@conciv/it/plugin/vite'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'

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
    conciv({devEndpointDir: E2E_DEV_ENDPOINT_DIR}),
  ],
})

export default config
