import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/uno-preset.ts'],
  platform: 'node',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  sourcemap: true,
  dts: false,
  fixedExtension: false,
})
