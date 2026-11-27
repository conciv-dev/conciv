import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {start: 'src/start.ts'},
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
})
