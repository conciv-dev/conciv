import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid()],
    environments: {
      client: {
        entries: ['src/ui-kit-system.tsx'],
        external: [/^solid-js/, /^@ark-ui\//, /^lucide-solid/, /^@conciv\//, /^@tanstack\/solid-hotkeys/],
      },
    },
  }),
)
