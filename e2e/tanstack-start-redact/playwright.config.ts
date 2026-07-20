import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('tanstack-start-redact', {
  command: (port) => `pnpm exec vite dev --port ${port} --strictPort --force`,
})
