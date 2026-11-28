import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/promise/promise.ts',
    'src/host.ts',
    'src/effect/effect.ts',
    'src/effect/permission.ts',
    'src/effect/plugin.ts',
    'src/effect/rpc.ts',
    'src/effect/session.ts',
    'src/effect/tool.ts',
    'src/promise/adapter.ts',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  unbundle: true,
  fixedExtension: false,
})
