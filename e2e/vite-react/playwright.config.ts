import {defineConfig} from '@playwright/test'
import {e2eConfig, e2ePort} from '@conciv/e2e-utils/config'

const standalonePort = await e2ePort('standalone')

export default defineConfig(
  await e2eConfig('vite-react', {
    dir: import.meta.dirname,
    command: (port, coldStart) => `./node_modules/.bin/vite --port ${port} --strictPort ${coldStart}`,
    pluginCopies: ['live-line', 'host-controls'],
    browserSettings: ['storage-refused', 'pop-out-refused'],
    fakeClis: ['codex', 'gemini'],
  }),
  {
    webServer: {
      command: `pnpm --filter @conciv/app exec vite preview --port ${standalonePort} --strictPort`,
      url: `http://localhost:${standalonePort}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  },
)
