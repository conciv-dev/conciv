import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid(), concivTest()],
    environments: {
      client: {
        entries: ['src/ui-kit-chat-tools.tsx'],
        external: [/^solid-js/, /^zod/, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//, /^lucide-solid/],
      },
    },
  }),
)
