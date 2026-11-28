import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/storage-history.ts'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
})
