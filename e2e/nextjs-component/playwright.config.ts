import {deployDir, e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs-component', {
  command: (port) => `cd "${deployDir('nextjs-component')}" && pnpm exec next dev --port ${port}`,
  webServerTimeout: 60_000,
})
