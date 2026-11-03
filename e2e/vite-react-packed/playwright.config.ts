import {defineConfig} from '@playwright/test'
import {e2eConfig} from '@conciv/e2e-utils/config'
import {PACKED_APP_DIR} from './packed-app-dir.ts'

export default defineConfig(
  e2eConfig('vite-react-packed', {
    command: (port) => `pnpm --dir ${JSON.stringify(PACKED_APP_DIR)} exec vite --port ${port} --strictPort --force`,
    reuseExistingServer: false,
  }),
  {testDir: '../vite-react/tests'},
)
