import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: [
    'src/plugin-testkit.ts',
    'src/browser.ts',
    'src/browser-engine.ts',
    'src/node-setup.ts',
    'src/browser-setup.ts',
    'src/test-projects.ts',
    'src/vitest.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {neverBundle: true},
})
