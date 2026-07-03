import react from '@vitejs/plugin-react'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import {cloudflare} from '@cloudflare/vite-plugin'
import {defineConfig} from 'vite'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    cloudflare({viteEnvironment: {name: 'ssr'}}),
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
    conciv({widget: {quickTerminal: {hotkey: ['Alt+k']}}}),
  ],
  ssr: {
    noExternal: ['gsap', '@gsap/react'],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
})
