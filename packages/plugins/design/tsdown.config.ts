import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig([
  {
    entry: ['src/design.ts'],
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: true,
    fixedExtension: false,
  },
  {
    entry: ['src/plugin-experimental.tsx'],
    platform: 'browser',
    tsconfig: 'tsconfig.build.json',
    dts: {dtsOnly: true},
    clean: false,
    plugins: [solid()],
  },
])
