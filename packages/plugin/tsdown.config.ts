import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: {
    'promise/index': 'src/promise/index.ts',
    rpc: 'src/rpc.ts',
    host: 'src/host.ts',
    'experimental/index': 'src/experimental/index.ts',
    'experimental/vite': 'src/experimental/vite.ts',
    'experimental/builtin': 'src/experimental/builtin.ts',
    'experimental/host': 'src/experimental/host.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
