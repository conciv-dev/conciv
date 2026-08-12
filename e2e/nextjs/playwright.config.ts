import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs', {
  command: (port) => `pnpm --filter @conciv/it run build && pnpm exec next dev --port ${port}`,
})
