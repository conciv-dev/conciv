import {defineConfig} from 'tsdown'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  sourcemap: true,
  entry: [
    'src/index.ts',
    'src/browser.tsx',
    'src/story.tsx',
    'src/happy-dom-setup.ts',
    'src/browser-setup.ts',
    'src/test-projects.ts',
    'src/vitest.ts',
    'src/run-tests.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  plugins: [solidPlugin()],
  deps: {neverBundle: true, alwaysBundle: ['@conciv/vitest-config', '@internal/plugin', '@internal/opaque']},
})
