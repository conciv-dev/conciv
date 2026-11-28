import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/bin.ts', 'src/connect.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  unbundle: true,
  fixedExtension: false,
})
