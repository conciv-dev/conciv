import {defineConfig, mergeConfig} from 'vitest/config'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import conciv from '@conciv/unplugin/vite'
import UnoCSS from 'unocss/vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  mergeConfig(
    libConfig({
      root: import.meta.url,
      plugins: [UnoCSS(), experimental(), conciv(), concivTest({browser: true})],
      environments: {
        server: {
          entries: [
            'src/test-runner.ts',
            'src/rpc.ts',
            'src/config.ts',
            'src/test-utils.ts',
            'src/vitest.ts',
            'src/vitest-child.ts',
            'src/playwright.ts',
            'src/playwright-child.ts',
          ],
        },
        client: {},
        types: {entries: ['src/plugin-experimental.tsx'], typesOnly: true},
      },
    }),
    {publicDir: false},
  ),
)
