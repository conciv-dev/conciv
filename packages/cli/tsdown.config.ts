import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/bin.ts', 'src/commands-json.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.json',
  dts: false,
  fixedExtension: false,
  deps: {onlyImport: ['@ast-grep/napi']},
})
