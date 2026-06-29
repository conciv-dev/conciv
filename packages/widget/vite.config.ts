import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// One entry (mount.tsx) ships as an ES module (`@mandarax/widget`) plus code-split chunks; the dev
// plugin serves them and injects `<script type="module">`. solid-js + @mandarax/extension are
// EXTERNAL (not inlined): the dev plugin loads the widget and the file-based extensions through one
// Vite graph, so both resolve to a SINGLE solid + a single ExtensionRuntimeContext — that is what lets
// an extension's useContext() resolve the context the widget's Provider sets. Inlining would give each
// its own copy and break it. The plugin is serve-only, so a host graph always provides the externals.
// Match by prefix, never a hand-listed set: EVERY @mandarax/extension subpath (/client carries
// MountedExtension + the Provider, /runtime, …) must externalize, or an inlined copy forks the
// ExtensionRuntimeContext and every host surface throws "called outside provider".
const isExternal = (id: string): boolean =>
  id === 'solid-js' ||
  id.startsWith('solid-js/') ||
  id === '@mandarax/extension' ||
  id.startsWith('@mandarax/extension/')

export default defineConfig({
  // UnoCSS runs via @unocss/postcss (postcss.config.mjs) expanding `@unocss all;` in styles.css, not as a
  // vite plugin — its shadow-dom mode's placeholder rewrite is dropped by vite@8's rolldown build hooks.
  plugins: [solid()],
  // js-beautify (via @mandarax/ui-kit-chat-tools' page-action card) ships UMD; its AMD branch lists `./lib/beautify*` paths that
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
    rollupOptions: {
      external: isExternal,
    },
  },
})
