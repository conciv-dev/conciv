import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: ['src/home.ts', 'src/migrated-db.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
