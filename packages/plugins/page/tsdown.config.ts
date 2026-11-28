import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: [
    'src/page.ts',
    'src/rpc.ts',
    'src/engine-builtins.ts',
    'src/client.ts',
    'src/renderer.tsx',
    'src/builtins.ts',
    'src/test-utils.ts',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  unbundle: true,
  fixedExtension: false,
  plugins: [solid()],
})
