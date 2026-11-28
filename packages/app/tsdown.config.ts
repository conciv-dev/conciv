import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: ['src/mount.ts'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: {emitDtsOnly: true},
  fixedExtension: false,
  deps: {neverBundle: [/\?inline$/]},
  plugins: [solid()],
})
