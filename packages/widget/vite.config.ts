import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// The widget ships two ways from one entry (mount.tsx): an ESM module (`@devgent/widget`)
// for programmatic embedding, and a self-contained IIFE global the vite-plugin injects as a
// plain <script> into the host page. React + react-dom are bundled in — the widget runs in
// an arbitrary host page and can't assume a React global. styles.css is imported `?inline`
// (see shadow.ts), so it's carried as a string and injected into the open Shadow DOM — there
// is no separate CSS asset to serve.
export default defineConfig({
  plugins: [react()],
  // React (and other deps) branch on process.env.NODE_ENV; vite's lib build doesn't replace
  // it, so a bare `process` would throw in the host page. Pin it to production at bundle time.
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/mount.tsx', import.meta.url)),
      formats: ['es', 'iife'],
      name: 'DevgentWidget',
      fileName: (format) => (format === 'iife' ? 'devgent-widget.global.js' : 'mount.js'),
    },
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true,
  },
})
