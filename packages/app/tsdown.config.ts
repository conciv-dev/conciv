import {defineConfig} from 'tsdown'
import solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: ['src/mount.ts'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: {dtsOnly: true},
  deps: {neverBundle: [/\?inline$/]},
  plugins: [solid()],
})
