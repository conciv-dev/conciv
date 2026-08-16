import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/react/index.ts'],
  outDir: 'dist/react',
  format: 'esm',
  fixedExtension: false,
  unbundle: true,
  dts: true,
  clean: false,
  tsconfig: 'tsconfig.react.json',
  external: ['react', /^react\//, /^react-dom/, /^\.\.\//],
})
