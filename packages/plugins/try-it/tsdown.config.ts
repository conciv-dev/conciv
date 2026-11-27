import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: ['src/plugin-experimental.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  plugins: [solid()],
})
