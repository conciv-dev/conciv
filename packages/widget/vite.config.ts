import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// One entry (mount.tsx) ships two ways: an ESM module (`@mandarax/widget`) and a self-contained IIFE
// global the plugin injects as a <script>. The Solid runtime is bundled in (no host-page
// framework assumed). styles.css is imported `?inline` (shadow.ts) and injected into the Shadow DOM.
export default defineConfig({
  // UnoCSS runs via @unocss/postcss (postcss.config.mjs) expanding `@unocss all;` in styles.css, not as a
  // vite plugin — its shadow-dom mode's placeholder rewrite is dropped by vite@8's rolldown build hooks.
  plugins: [solid()],
  // js-beautify (via @mandarax/tool-ui) ships UMD; its AMD branch lists `./lib/beautify*` paths that
  // never exist in our bundle. Folding `define.amd` to false drops that dead branch so downstream
  // bundlers (Next/turbopack consuming mount.js) don't try to resolve those phantom modules.
  define: {'define.amd': 'false'},
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
