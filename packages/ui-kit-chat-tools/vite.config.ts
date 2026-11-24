import {defineConfig, mergeConfig} from 'vite'
import {solidLibConfig} from '@internal/vitest-config/vite-lib'
import {concivTest} from '@internal/vitest-config/test-config'

export default defineConfig(
  mergeConfig(
    solidLibConfig({
      entry: new URL('src/index.tsx', import.meta.url),
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//, /^lucide-solid/],
    }),
    {plugins: [concivTest()]},
  ),
)
