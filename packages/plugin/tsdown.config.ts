import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'rpc-entry': 'src/rpc-entry.ts',
    host: 'src/host.ts',
    'experimental/index': 'src/experimental/index.ts',
    'experimental/builtin': 'src/experimental/builtin.ts',
    'experimental/host': 'src/experimental/host.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
