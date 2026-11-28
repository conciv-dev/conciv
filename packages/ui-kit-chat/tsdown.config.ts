import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/ui-kit-chat.tsx',
    'src/tools.tsx',
    'src/draft-storage.ts',
    'src/theme/fonts.ts',
    'src/theme/code-theme.ts',
  ],
  platform: 'browser',
  tsconfig: 'tsconfig.build.json',
  dts: {emitDtsOnly: true},
  unbundle: true,
  fixedExtension: false,
  deps: {neverBundle: [/\?/]},
})
