import {fileURLToPath} from 'node:url'
import UnoCSS from 'unocss/vite'
import {defineConfig, type PluginOption} from 'vite'
import solid from 'vite-plugin-solid'

function local(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

async function compiler(command: 'build' | 'serve'): Promise<PluginOption> {
  if (command === 'build') return solid()
  const {default: conciv} = await import('../../it/dist/vite.js')
  return conciv()
}

export default defineConfig(async ({command}) => ({
  root: local('src/xray/'),
  base: './',
  plugins: [await compiler(command), UnoCSS({configFile: local('uno.config.ts')})],
  experimental: {
    renderBuiltUrl: (filename: string, context: {hostType: 'js' | 'css' | 'html'}) =>
      context.hostType === 'html' ? `xray/${filename}` : {relative: true},
  },
  build: {outDir: local('dist/xray/'), emptyOutDir: true, sourcemap: true},
}))
