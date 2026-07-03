import react from '@vitejs/plugin-react'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import {defineConfig} from 'vite'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    netlify(),
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
