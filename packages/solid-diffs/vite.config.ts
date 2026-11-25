import {defineConfig} from 'vite'
import {solidLibConfig} from '@internal/vite-config'

export default defineConfig(
  solidLibConfig({
    entry: new URL('src/solid-diffs.tsx', import.meta.url),
    external: [/^solid-js/, /^@pierre\/diffs(?!.*\?worker)/, /^shiki/, /^@shikijs\//, /^@tanstack\/solid-pacer/],
  }),
)
