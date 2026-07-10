import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/start.ts', 'src/config.ts', 'src/app.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
