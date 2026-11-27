import {globSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: globSync('src/**/*.ts', {
          cwd: fileURLToPath(new URL('.', import.meta.url)),
          exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
        }),
      },
    },
  }),
)
