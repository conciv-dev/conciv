import {defineConfig} from 'vite'
import {devtools} from '@tanstack/devtools-vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {devgent} from '@devgent/vite-plugin'

// The only devgent wiring a host app needs: add the plugin. It serves the widget bundle and
// injects it into the page itself, and mounts the /__pw/* dev-agent surface. It's a no-op in
// production builds. `claude` must be on PATH for the chat to answer.
const config = defineConfig({
  resolve: {tsconfigPaths: true},
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact(), devgent()],
})

export default config
