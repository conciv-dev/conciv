import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    environments: {
      server: {
        entries: ['src/conciv-lockup.tsx'],
        external: ['react', /^motion/],
        banner: "'use client';",
      },
    },
  }),
)
