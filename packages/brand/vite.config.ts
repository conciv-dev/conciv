import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [solid()],
    environments: {
      client: {
        entries: {solid: 'src/solid/conciv-lockup.tsx'},
        external: [/^solid-js/, /^motion/],
      },
    },
  }),
)
