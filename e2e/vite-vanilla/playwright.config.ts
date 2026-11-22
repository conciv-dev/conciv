import {defineConfig} from '@playwright/test'
import {e2eConfig} from '@conciv/e2e-utils/config'

export default defineConfig(
  e2eConfig('vite-vanilla', {
    dir: import.meta.dirname,
    command: (port) => `./node_modules/.bin/vite --port ${port} --strictPort --force`,
    fakeClis: ['codex', 'gemini'],
  }),
  {
    webServer: {
      command: 'pnpm --filter @conciv/app exec vite dev --port 4330 --strictPort',
      url: 'http://localhost:4330',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  },
)
