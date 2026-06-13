import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import devgent from '@devgent/plugin/vite'

// Add the devgent plugin — dev-only; override defaults via devgent({harness, previewId, …}).
export default defineConfig({
  resolve: {tsconfigPaths: true},
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact(), devgent()],
})
