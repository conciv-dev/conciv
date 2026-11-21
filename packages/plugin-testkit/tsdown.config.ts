import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/node.ts',
    'src/browser.ts',
    'src/browser-engine.ts',
    'src/happy-dom.ts',
    'src/node-setup.ts',
    'src/happy-dom-setup.ts',
    'src/browser-setup.ts',
    'src/dom-environment.ts',
    'src/test-projects.ts',
    'src/vitest.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  deps: {neverBundle: true},
})
