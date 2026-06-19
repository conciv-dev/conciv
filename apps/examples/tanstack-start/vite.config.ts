import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mandarax from '@mandarax/qu/plugin/vite'

// Add the mandarax plugin — dev-only; override defaults via mandarax({harness, previewId, …}).
export default defineConfig({
  resolve: {tsconfigPaths: true},
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    mandarax({widget: {quickTerminal: {hotkey: 'Alt+k'}}}),
  ],
})
