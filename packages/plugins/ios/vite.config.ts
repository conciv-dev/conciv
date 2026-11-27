import {defineConfig} from 'vite'
import UnoCSS from 'unocss/vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [UnoCSS(), solid(), concivTest()],
    environments: {
      server: {entries: ['src/ios.ts', 'src/rpc.ts']},
      client: {entries: {builtins: 'src/builtins.ts'}, external: [/^solid-js/, /^zod/, /^@conciv\//]},
    },
  }),
)
