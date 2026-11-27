import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'
import {inlineSheet} from '@internal/build-plugins'

export default defineConfig({
  entry: ['src/builtins.ts'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  plugins: [inlineSheet(import.meta.url), solid()],
})
