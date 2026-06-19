import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// One entry (mount.tsx) ships two ways: an ESM module (`@mandarax/widget`) and a self-contained IIFE
// global the plugin injects as a <script>. The Solid runtime is bundled in (no host-page
// framework assumed). styles.css is imported `?inline` (shadow.ts) and injected into the Shadow DOM.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/mount.tsx', import.meta.url)),
      formats: ['es', 'iife'],
      name: 'MandaraxWidget',
      fileName: (format) => (format === 'iife' ? 'mandarax-widget.global.js' : 'mount.js'),
    },
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true,
  },
})
