import {e2eConfig} from '@conciv/e2e-utils/config'
import {PACKED_APP_DIR} from './packed-app-dir.ts'

export default e2eConfig('vite-react-packed', {
  command: (port) => `pnpm --dir ${JSON.stringify(PACKED_APP_DIR)} exec vite --port ${port} --strictPort --force`,
})
