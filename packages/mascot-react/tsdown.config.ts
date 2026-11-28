import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/mascot-react.ts'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  unbundle: true,
})
