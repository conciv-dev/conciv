import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig([
  {
    entry: ['src/ios.ts', 'src/rpc.ts'],
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: true,
    sourcemap: true,
    unbundle: true,
    fixedExtension: false,
  },
  {
    entry: {builtins: 'src/builtins.ts'},
    platform: 'browser',
    tsconfig: 'tsconfig.build.json',
    dts: true,
    sourcemap: true,
    clean: false,
    fixedExtension: false,
    plugins: [solid()],
  },
])
