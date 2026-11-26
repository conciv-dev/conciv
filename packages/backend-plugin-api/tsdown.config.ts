import {defineConfig} from 'tsdown'

export default defineConfig({
  sourcemap: true,
  entry: {
    'promise/promise': 'src/promise/promise.ts',
    host: 'src/host.ts',
    'effect/effect': 'src/effect/effect.ts',
    'effect/permission': 'src/effect/permission.ts',
    'effect/plugin': 'src/effect/plugin.ts',
    'effect/rpc': 'src/effect/rpc.ts',
    'effect/session': 'src/effect/session.ts',
    'effect/tool': 'src/effect/tool.ts',
    'promise/adapter': 'src/promise/adapter.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
