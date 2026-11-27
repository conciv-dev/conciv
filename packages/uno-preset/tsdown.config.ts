import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/uno-preset.ts', 'src/inline-sheet.ts'],
  platform: 'node',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  sourcemap: true,
  dts: false,
  unbundle: true,
  fixedExtension: false,
})
