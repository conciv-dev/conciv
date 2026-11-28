import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/preact.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
})
