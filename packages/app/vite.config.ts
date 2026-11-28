import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

function classicScriptLoaders(): Plugin {
  return {
    name: 'conciv-classic-script-loaders',
    applyToEnvironment: (environment) => environment.name === 'widget',
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

const shellSource = import.meta.resolve('@internal/frontend-defaults')

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'solid',
      autoCodeSplitting: true,
      routesDirectory: fileURLToPath(new URL('./routes', shellSource)),
      generatedRouteTree: fileURLToPath(new URL('./routeTree.gen.ts', shellSource)),
      routeFileIgnorePattern: String.raw`\.test\.tsx?$`,
    }),
    UnoCSS(),
    solid(),
    classicScriptLoaders(),
    concivTest({browser: true}),
  ],
  define: {'define.amd': 'false'},
  server: {warmup: {clientFiles: ['./src/mount-impl.tsx']}},
  builder: {},
  environments: {
    client: {
      build: {
        lib: {entry: {mount: 'src/mount.ts'}, formats: ['es']},
        emptyOutDir: false,
        rolldownOptions: {
          external: [
            /^solid-js(\/|$)(?!.*\?inline)/,
            /^effect(\/|$)(?!.*\?inline)/,
            /^@ark-ui\/(?!.*\?inline)/,
            /^@conciv\/(?!plugin-page\/builtins)(?!.*\?inline)/,
          ],
        },
      },
    },
    widget: {
      consumer: 'client',
      define: {'process.env.NODE_ENV': '"production"'},
      build: {
        lib: {
          entry: {'conciv-widget': 'src/global-entry.ts', 'conciv-widget-native': 'src/native-entry.ts'},
          formats: ['es'],
        },
        emptyOutDir: false,
        rolldownOptions: {
          output: {
            entryFileNames: 'widget/[name]-[hash].js',
            chunkFileNames: 'widget/[name]-[hash].js',
            assetFileNames: 'widget/[name]-[hash][extname]',
            minify: true,
          },
        },
      },
    },
  },
})
