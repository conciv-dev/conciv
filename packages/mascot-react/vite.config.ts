import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    environments: {
      server: {
        entries: ['src/mascot-react.ts'],
        external: ['react', /^react\//, /^@conciv\/mascot/],
        bundle: false,
      },
    },
  }),
)
