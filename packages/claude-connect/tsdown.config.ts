import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/bridge.ts',
    'src/install-state.ts',
    'src/json.ts',
    'src/names.ts',
    'src/paths.ts',
    'src/plugin-files.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
