import {defineConfig} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import conciv from '@conciv/it/plugin/vite'

const withNitro = process.env.CONCIV_NITRO === '1'

export default defineConfig(async () => {
  const nitroPlugin = withNitro ? (await import('nitro/vite')).nitro({rollupConfig: {external: [/^@sentry\//]}}) : null

  return {
    resolve: {tsconfigPaths: true},
    plugins: [
      ...(nitroPlugin ? [nitroPlugin] : []),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      conciv({
        port: 5411,
      }),
    ],
  }
})
