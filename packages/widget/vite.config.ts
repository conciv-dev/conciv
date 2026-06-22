import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// One entry (mount.tsx) ships as an ES module (`@mandarax/widget`) plus code-split chunks: the plugin
// serves the dist dir and injects `<script type="module" src=mount.js>`, so heavy lazy imports (the
// Excalidraw island, shiki languages) stay in separate chunks loaded on demand — never in the core.
// The Solid runtime is bundled in (no host-page framework assumed). styles.css is imported `?inline`
// (shadow.ts) and injected into the Shadow DOM.
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
      formats: ['es'],
      fileName: () => 'mount.js',
    },
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true,
    // The bundled whiteboard extension dynamic-imports a server-only chunk (the oxc anchor resolver)
    // that pulls node:* + oxc-parser. That chunk is never executed in the browser (server tool execute
    // only), so externalize those so the browser build doesn't try to bundle the native binding.
    rollupOptions: {external: [/^node:/, /^oxc-parser/, /^@oxc-parser\//]},
  },
})
