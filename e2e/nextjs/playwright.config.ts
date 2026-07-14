import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs', {
  command: (port) => `rm -rf .next && pnpm exec next dev --port ${port}`,
})
