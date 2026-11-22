import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    sourcemap: true,
    entry: {
      server: 'src/server.ts',
      testkit: 'src/testkit.ts',
      'quickjs-worker': 'src/server/quickjs-worker.ts',
    },
    format: 'esm',
    fixedExtension: false,
    dts: false,
  },
  {
    sourcemap: true,
    entry: {client: 'src/client.ts'},
    format: 'esm',
    fixedExtension: false,
    dts: false,
    noExternal: [/^@tanstack\/ai-(client|solid)(\/|$)/],
    env: {NODE_ENV: 'production'},
  },
])
