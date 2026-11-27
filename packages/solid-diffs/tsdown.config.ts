import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/solid-diffs.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: {emitDtsOnly: true},
  fixedExtension: false,
  deps: {neverBundle: [/\?/]},
})
