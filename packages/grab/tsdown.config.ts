import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/grab.ts'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
})
