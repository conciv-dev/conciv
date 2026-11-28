import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig([
  {
    entry: [
      'src/test-runner.ts',
      'src/rpc.ts',
      'src/config.ts',
      'src/test-utils.ts',
      'src/vitest.ts',
      'src/vitest-child.ts',
      'src/playwright.ts',
      'src/playwright-child.ts',
    ],
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
