import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs', {
  dir: import.meta.dirname,
  command: (port) => `pnpm --filter @conciv/it run build && pnpm exec next dev --port ${port}`,
})
