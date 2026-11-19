import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import conciv from '@conciv/it/plugin/vite'

const testRunnerPlugin = fileURLToPath(new URL('.', import.meta.resolve('@conciv/plugin-test-runner/package.json')))
const tanstackPlugin = fileURLToPath(new URL('.', import.meta.resolve('@conciv/plugin-tanstack/package.json')))
const withNitro = process.env.CONCIV_NITRO === '1'

export default defineConfig(async () => {
  const nitroPlugin = withNitro ? (await import('nitro/vite')).nitro({rollupConfig: {external: [/^@sentry\//]}}) : null

  return {
    resolve: {tsconfigPaths: true},
    plugins: [
      devtools(),
      ...(nitroPlugin ? [nitroPlugin] : []),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      conciv({
        widget: {quickTerminal: {hotkey: 'Alt+k'}},
        plugins: [testRunnerPlugin, tanstackPlugin],
      }),
    ],
  }
})
