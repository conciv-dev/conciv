import {defineConfig} from '@playwright/test'
import {e2eConfig} from '@conciv/e2e-utils/config'
import {PACKED_APP_DIR, PACKED_ROOT} from './test/packed-app-dir.ts'

export default defineConfig(
  e2eConfig('vite-react-packed', {
    dir: import.meta.dirname,
    command: (port, coldStart) =>
      `pnpm --dir ${JSON.stringify(PACKED_APP_DIR)} exec vite --port ${port} --strictPort ${coldStart}`,
    runFolders: [PACKED_ROOT],
  }),
  {testDir: '../vite-react/test'},
)
