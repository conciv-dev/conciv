import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'
import {inlineImports} from '@internal/build-plugins'

export default defineConfig({
  entry: ['src/solid-diffs.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  deps: {alwaysBundle: [/\?(?:worker&)?inline$/]},
  plugins: [inlineImports(), solid()],
})
