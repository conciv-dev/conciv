import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Test-only build: a self-contained IIFE (solid + @conciv/extension INLINED, no externals) that the
// node E2E suites inject via <script>. The published package stays ESM-only (vite.config.ts); this
// artifact is never exported — it only restores a self-mounting bundle for the injection-based tests.
// emptyOutDir:false so it appends to dist/ after the ESM build, not wipe it.
export default defineConfig({
  plugins: [solid()],
  define: {'define.amd': 'false'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('test/fixtures/global-entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'ConcivWidget',
      fileName: () => 'conciv-widget.global.js',
    },
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: true,
  },
})
