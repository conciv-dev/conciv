import {createReadStream} from 'node:fs'
import {createRequire} from 'node:module'
import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import {devgent} from '@devgent/vite-plugin'

const require = createRequire(import.meta.url)

// Serve the prebuilt widget global bundle at the URL the plugin injects. A real app would
// likely publish the bundle to a CDN and point widgetUrl there; here we serve it straight
// from the @devgent/widget package so `pnpm dev` works with no extra wiring.
function serveDevgentWidget(): Plugin {
  return {
    name: 'serve-devgent-widget',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/@devgent/widget.js', (_req, res) => {
        res.setHeader('content-type', 'text/javascript')
        createReadStream(require.resolve('@devgent/widget/global')).pipe(res)
      })
    },
  }
}

// The host app's vite config. devgent() spawns the dev-agent behind /__pw/* and injects the
// widget; it's a no-op in production builds (apply: 'serve'). Run `claude` must be on PATH
// for the chat to answer — see the README.
export default defineConfig({
  plugins: [react(), serveDevgentWidget(), devgent({enabled: true, widgetUrl: '/@devgent/widget.js'})],
})
