import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'

import {tanstackStart} from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {nitro} from 'nitro/vite'
import {redact} from '@tanstack/redact/vite'
import conciv from '@conciv/it/plugin/vite'

const serverVariantAliases: Record<string, string> = {
  'react-dom/server': '@tanstack/redact/server',
  'react-dom/server.edge': '@tanstack/redact/server',
  'react-dom/server.node': '@tanstack/redact/server',
  'react-dom/server.bun': '@tanstack/redact/server',
  'react-dom/server.browser': '@tanstack/redact/server',
  'react-dom/static.edge': '@tanstack/redact/server',
  'react-dom/static.node': '@tanstack/redact/server',
  'react-dom/static': '@tanstack/redact/server',
}

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      {find: /^use-sync-external-store\/shim\/index\.js$/, replacement: '@tanstack/redact'},
      ...Object.entries(serverVariantAliases).map(([find, replacement]) => ({find, replacement})),
    ],
  },
  plugins: [
    devtools(),
    nitro({rollupConfig: {external: [/^@sentry\//]}}),
    tailwindcss(),
    redact(),
    tanstackStart(),
    viteReact(),
    conciv(),
  ],
})

export default config
