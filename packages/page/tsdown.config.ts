import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@conciv\//, 'react-grab', 'bippy', /^bippy\//, 'solid-js', /^solid-js\//],
})
