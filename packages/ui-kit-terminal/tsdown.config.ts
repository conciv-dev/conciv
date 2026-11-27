import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/ui-kit-terminal.tsx'],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: {emitDtsOnly: true},
  fixedExtension: false,
  deps: {neverBundle: [/\?/]},
})
