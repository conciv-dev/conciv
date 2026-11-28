import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/uno-preset.ts', 'src/build-shadow-css.ts'],
  platform: 'node',
  dts: false,
  fixedExtension: false,
})
