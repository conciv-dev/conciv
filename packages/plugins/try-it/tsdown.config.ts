import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'
import {inlineSheet} from '@internal/uno-preset/inline-sheet'

export default defineConfig({
  entry: ['src/plugin-experimental.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  plugins: [inlineSheet(import.meta.url), solid()],
})
