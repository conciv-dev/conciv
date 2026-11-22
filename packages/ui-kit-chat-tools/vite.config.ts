import {defineConfig, mergeConfig} from 'vite'
import {solidLibConfig} from '@conciv/vitest-config/vite-lib'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig(
  mergeConfig(
    solidLibConfig({
      entry: new URL('src/index.tsx', import.meta.url),
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//, /^lucide-solid/],
    }),
    {plugins: [concivTest()]},
  ),
)
