import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('vite-vanilla', {
  command: (port) => `pnpm exec vite --port ${port} --strictPort --force`,
})
