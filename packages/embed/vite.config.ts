import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

const EXTERNAL_PREFIXES = ['solid-js/', 'effect/', '@ark-ui/', '@conciv/']

const INLINED_PREFIXES = [
  '@conciv/plugin-page/client',
  '@conciv/plugin-page/renderer',
  '@conciv/app',
  '@conciv/plugin-internal',
  '@conciv/plugin-tanstack',
  '@conciv/plugin-terminal',
  '@conciv/tools',
  '@conciv/core',
]

const isExternal = (id: string): boolean => {
  if (id.endsWith('?inline')) return false
  if (INLINED_PREFIXES.some((prefix) => id.startsWith(prefix))) return false
  return id === 'solid-js' || id === 'effect' || EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix))
}

const widgetEntries = {
  'conciv-widget': fileURLToPath(new URL('test/fixtures/global-entry.ts', import.meta.url)),
  'conciv-widget-native': fileURLToPath(new URL('src/native-entry.ts', import.meta.url)),
}

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

export default defineConfig(({mode}) => ({
  plugins: [...(mode === 'test' ? [] : [UnoCSS()]), solid(), classicScriptLoaders(), concivTest()],

  define: {'define.amd': 'false'},
  build: {cssCodeSplit: false},
  environments: {
    client: {
      build: {
        lib: {
          entry: fileURLToPath(new URL('src/mount.ts', import.meta.url)),
          formats: ['es'],
          fileName: () => 'mount.js',
        },
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {external: isExternal},
      },
    },
    widget: {
      consumer: 'client',
      define: {'process.env.NODE_ENV': '"production"'},
      build: {
        lib: {entry: widgetEntries, formats: ['es']},
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
    },
  },
  builder: {
    buildApp: async (builder) => {
      for (const name of ['client', 'widget']) {
        const environment = builder.environments[name]
        if (!environment) throw new Error(`the embed build has no ${name} environment`)
        await builder.build(environment)
      }
    },
  },
}))
