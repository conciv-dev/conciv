import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/uno-preset.ts', 'src/build-shadow-css.ts'],
  platform: 'node',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  dts: false,
  unbundle: true,
  fixedExtension: false,
})
