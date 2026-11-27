import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [UnoCSS(), solid(), concivTest({browser: true})],
    environments: {
      client: {
        entries: {'plugin-experimental': 'src/plugin-experimental.tsx'},
        external: [/^solid-js/, /^zod/, /^effect/, /^@conciv\//, /^@solid-primitives\//],
      },
    },
  }),
)
