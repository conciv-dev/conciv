import {fileURLToPath} from 'node:url'
import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

const sourceDir = fileURLToPath(new URL('src/', import.meta.url))
const clientEntry = ['src/client.ts', 'src/renderer.tsx', 'src/builtins.ts', 'src/test-utils.ts']
const browser = {platform: 'browser', tsconfig: 'tsconfig.build.json', clean: false, fixedExtension: false} as const

const rpcFromPackage = {
  name: 'page-rpc-from-package',
  resolveId: (source: string, importer: string | undefined) =>
    source === './rpc.js' && importer?.startsWith(sourceDir) ? {id: '@conciv/plugin-page/rpc', external: true} : null,
}

export default defineConfig([
  {
    entry: ['src/page.ts', 'src/rpc.ts', 'src/engine-builtins.ts'],
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: true,
    sourcemap: true,
    unbundle: true,
    fixedExtension: false,
  },
  {
    ...browser,
    entry: clientEntry,
    dts: false,
    sourcemap: true,
    plugins: [rpcFromPackage, solid()],
  },
  ...clientEntry.map((file) => ({
    ...browser,
    entry: [file],
    dts: {emitDtsOnly: true},
    plugins: [rpcFromPackage, solid()],
  })),
])
