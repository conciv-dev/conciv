import {defineConfig, mergeConfig} from 'vite'
import {solidLibConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  mergeConfig(
    solidLibConfig({
      entry: new URL('src/ui-kit-chat-tools.tsx', import.meta.url),
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//, /^lucide-solid/],
    }),
    {plugins: [concivTest()]},
  ),
)
