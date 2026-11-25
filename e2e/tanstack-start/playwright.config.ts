import {e2eConfig} from '@internal/e2e-utils/config'

export default await e2eConfig('tanstack-start', {
  dir: import.meta.dirname,
  command: (port, coldStart) => `pnpm exec vite dev --port ${port} --strictPort ${coldStart}`,
})
