import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid()],
    environments: {
      client: {
        entries: ['src/solid-diffs.tsx'],
        external: [/^solid-js/, /^@pierre\/diffs(?!.*\?worker)/, /^shiki/, /^@shikijs\//, /^@tanstack\/solid-pacer/],
      },
    },
  }),
)
