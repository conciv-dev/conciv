import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'

const entries = {
  'conciv-widget': fileURLToPath(new URL('test/fixtures/global-entry.ts', import.meta.url)),
  'conciv-widget-native': fileURLToPath(new URL('src/native-entry.ts', import.meta.url)),
}

function classicScriptLoaders(): Plugin {
  return {
    name: 'conciv-classic-script-loaders',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        this.emitFile({
          type: 'asset',
          fileName: `${chunk.name}.global.js`,
          source: `import(new URL(${JSON.stringify(chunk.fileName)}, document.currentScript.src).href)\n`,
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [UnoCSS(), solid(), classicScriptLoaders()],
  define: {'define.amd': 'false', 'process.env.NODE_ENV': '"production"'},
  build: {
    lib: {entry: entries, formats: ['es']},
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'widget/[name]-[hash].js',
        chunkFileNames: 'widget/[name]-[hash].js',
        assetFileNames: 'widget/[name]-[hash][extname]',
        minify: true,
      },
    },
  },
})
