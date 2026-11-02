import {fileURLToPath} from 'node:url'
import UnoCSS from 'unocss/vite'
import {defineConfig, type PluginOption} from 'vite'
import solid from 'vite-plugin-solid'

function local(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

async function compiler(command: 'build' | 'serve'): Promise<PluginOption> {
  if (command === 'build') return solid()
  const plugin = new URL('../../it/dist/vite.js', import.meta.url).href
  const {default: conciv} = await import(plugin)
  return conciv()
}

export default defineConfig(async ({command}) => ({
  root: local('src/xray/'),
  base: './',
  plugins: [await compiler(command), UnoCSS({configFile: local('uno.config.ts')})],
  build: {
    outDir: local('dist/xray/'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {output: {assetFileNames: 'assets/[name][extname]'}},
  },
}))
