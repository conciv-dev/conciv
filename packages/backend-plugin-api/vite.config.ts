import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: {
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
      },
    },
  }),
)
