import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: ['src/plugin-experimental.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  plugins: [solid()],
})
