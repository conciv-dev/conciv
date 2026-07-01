import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import conciv from '@conciv/qu/plugin/vite'

// Add the conciv plugin — dev-only; override defaults via conciv({harness, sessionId, …}).
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
