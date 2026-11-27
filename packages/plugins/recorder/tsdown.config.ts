import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig([
  {
    entry: ['src/recorder.ts', 'src/rpc.ts'],
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: true,
    sourcemap: true,
    unbundle: true,
    fixedExtension: false,
  },
  {
    entry: ['src/plugin-experimental.tsx'],
    platform: 'browser',
    tsconfig: 'tsconfig.build.json',
    dts: {emitDtsOnly: true},
    clean: false,
    fixedExtension: false,
    plugins: [solid()],
  },
])
