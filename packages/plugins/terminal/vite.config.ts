import {defineConfig} from 'vite'
import UnoCSS from 'unocss/vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [UnoCSS(), solid(), concivTest({browser: true})],
    environments: {
      client: {
        entries: ['src/builtins.ts'],
        external: [/^solid-js/, /^zod/, /^effect/, /^@conciv\//, /^@orpc\//, /^@solid-primitives\//, /^lucide-solid/],
      },
    },
  }),
)
