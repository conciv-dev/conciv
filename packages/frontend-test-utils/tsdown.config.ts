import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: ['src/render-test-app.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: {dtsOnly: true},
  plugins: [solid()],
})
