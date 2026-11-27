import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/bin.ts', 'src/commands-json.ts'],
  platform: 'node',
  tsconfig: 'tsconfig.json',
  dts: false,
  sourcemap: true,
  fixedExtension: false,
  deps: {onlyImport: ['@ast-grep/napi']},
})
