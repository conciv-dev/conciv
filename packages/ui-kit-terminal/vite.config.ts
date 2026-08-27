import {defineConfig} from 'vite'
import {solidLibConfig} from '@conciv/vitest-config/vite-lib'

export default defineConfig(
  solidLibConfig({
    entry: new URL('src/index.tsx', import.meta.url),
    external: [/^solid-js/, /^zod/, /^@conciv\//, /^@xterm\/(?!xterm\/css)/],
  }),
)
