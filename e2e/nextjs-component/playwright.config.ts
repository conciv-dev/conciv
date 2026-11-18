import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs-component', {
  dir: import.meta.dirname,
  command: (port) => `pnpm --filter @conciv/it --filter @conciv/react run build && pnpm exec next dev --port ${port}`,
})
