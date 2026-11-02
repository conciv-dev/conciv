import {defineConfig} from 'tsdown'
import Solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/host.ts',
    'src/catalog.ts',
    'src/define-tool.ts',
    'src/rpc-mount.ts',
    'src/tool-registry.ts',
    'src/devframe-host.ts',
    'src/devframe-connection.ts',
    'src/devframe-function.ts',
    'src/devframe-plugin.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  plugins: [Solid()],
})
