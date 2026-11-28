import {defineConfig} from 'tsdown'

const entry = ['src/backend-test-utils.ts', 'src/browser.ts', 'src/vitest.ts']

export default defineConfig([
  {
    entry,
    platform: 'node',
    tsconfig: 'tsconfig.build.json',
    dts: false,
    sourcemap: true,
    fixedExtension: false,
  },
  ...entry.map((file) => ({
    entry: [file],
    platform: 'node' as const,
    tsconfig: 'tsconfig.build.json',
    dts: {emitDtsOnly: true},
    clean: false,
    fixedExtension: false,
  })),
])
