import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: [
    'src/index.ts',
    'src/browser.ts',
    'src/browser-engine.ts',
    'src/node-setup.ts',
    'src/happy-dom-setup.ts',
    'src/browser-setup.ts',
    'src/test-projects.ts',
    'src/vitest.ts',
    'src/run-tests.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {neverBundle: true, alwaysBundle: ['@conciv/vitest-config']},
})
