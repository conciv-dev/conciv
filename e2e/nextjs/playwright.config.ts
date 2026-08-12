import {deployDir, e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs', {
  command: (port) => `cd "${deployDir('nextjs')}" && pnpm exec next dev --port ${port}`,
  webServerTimeout: 60_000,
})
