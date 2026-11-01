import {e2eConfig} from '@conciv/e2e-utils/config'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'
import {PACKED_APP_DIR} from './packed-app-dir.ts'

export default e2eConfig('vite-react-packed', {
  command: (port) =>
    `CONCIV_E2E_DEV_ENDPOINT_DIR=${JSON.stringify(E2E_DEV_ENDPOINT_DIR)} pnpm --dir ${JSON.stringify(PACKED_APP_DIR)} exec vite --port ${port} --strictPort --force`,
})
