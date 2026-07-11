import {defineConfig} from 'tsdown'
import Solid from 'unplugin-solid/rolldown'

export default defineConfig({
  entry: ['src/index.ts', 'src/catalog.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  plugins: [Solid()],
})
