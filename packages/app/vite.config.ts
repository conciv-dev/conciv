import {defineConfig, mergeConfig, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {libConfig} from '@internal/vite-config'
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

export default defineConfig(
  mergeConfig(
    libConfig({
      root: import.meta.url,
      plugins: [UnoCSS(), solid(), classicScriptLoaders(), concivTest({browser: true})],
      environments: {
        client: {
          entries: ['src/mount.ts'],
          external: [
            /^solid-js(\/|$)(?!.*\?inline)/,
            /^effect(\/|$)(?!.*\?inline)/,
            /^@ark-ui\/(?!.*\?inline)/,
            /^@conciv\/(?!plugin-page\/builtins)(?!.*\?inline)/,
          ],
        },
        widget: {
          consumer: 'client',
          entries: {'conciv-widget': 'src/global-entry.ts', 'conciv-widget-native': 'src/native-entry.ts'},
          define: {'process.env.NODE_ENV': '"production"'},
          bundleDir: 'widget',
        },
      },
    }),
    {define: {'define.amd': 'false'}, server: {warmup: {clientFiles: ['./src/mount-impl.tsx']}}},
  ),
)
