import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    conciv({widget: {quickTerminal: {hotkey: 'Alt+k'}}}),
  ],
})
