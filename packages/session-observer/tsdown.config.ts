import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/types.ts', 'src/machine.ts', 'src/observer.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
