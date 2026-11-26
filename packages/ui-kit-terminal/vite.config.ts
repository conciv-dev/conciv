import {defineConfig} from 'vite'
import {solidLibConfig} from '@internal/vite-config'

export default defineConfig(
  solidLibConfig({
    entry: new URL('src/ui-kit-terminal.tsx', import.meta.url),
    external: [/^solid-js/, /^@conciv\//, /^@xterm\/(?!xterm\/css)/],
  }),
)
