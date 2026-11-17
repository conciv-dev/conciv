import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/capture-plugins.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
  external: [/^@conciv\//, 'react-grab', 'bippy', /^bippy\//, 'solid-js', /^solid-js\//],
})
