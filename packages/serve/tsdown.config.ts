import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/serve.ts', 'src/rpc.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  unbundle: true,
  fixedExtension: false,
})
