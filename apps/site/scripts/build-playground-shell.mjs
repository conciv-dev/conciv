import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {presetConciv} from '@internal/uno-preset'

const siteDir = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = fileURLToPath(new URL('../../../packages', import.meta.url))

const SCANNED = [
  'frontend-defaults/src',
  'frontend-app-api/src',
  'ui-kit-chat/src',
  'ui-kit-chat-tools/src',
  'ui-kit-system/src',
  'ui-kit-terminal/src',
  'ui-kit-tap/src',
  'plugins/page/src',
  'plugins/terminal/src',
]
  .map((source) => join(packagesDir, source))
  .concat(join(siteDir, 'playground-shell'))
  .flatMap((source) => [`${source}/**/*.{ts,tsx}`, `!${source}/**/*.{test,spec,stories}.*`])

await build({
  configFile: false,
  root: siteDir,
  publicDir: false,
  logLevel: 'warn',
  define: {'process.env.NODE_ENV': '"production"', 'define.amd': 'false'},
  plugins: [UnoCSS({content: {filesystem: SCANNED}, presets: [presetConciv()]}), solid()],
  build: {
    outDir: 'public/playground-shell',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {output: {minify: true}},
    lib: {
      entry: join(siteDir, 'playground-shell/start-playground.ts'),
      formats: ['es'],
      fileName: () => 'start-playground.js',
    },
  },
})
