import {defineConfig} from '@playwright/test'
import {e2eConfig} from '@conciv/e2e-utils/config'

export default defineConfig(
  e2eConfig('vite-react', {
    dir: import.meta.dirname,
    command: (port, coldStart) => `./node_modules/.bin/vite --port ${port} --strictPort ${coldStart}`,
    browserSettings: ['storage-refused', 'pop-out-refused'],
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
