import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    environments: {client: {entries: ['src/render-test-app.tsx'], typesOnly: true, external: [/^@internal\//]}},
  }),
)
