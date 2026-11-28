import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/home.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  fixedExtension: false,
})
