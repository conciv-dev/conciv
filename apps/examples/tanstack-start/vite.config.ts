import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import aidx from '@aidx/plugin/vite'

// Add the aidx plugin — dev-only; override defaults via aidx({harness, previewId, …}).
export default defineConfig({
  resolve: {tsconfigPaths: true},
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact(), aidx()],
})
