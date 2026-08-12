import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('nextjs-component', {
  command: (port) =>
    `pnpm --filter @conciv/it --filter @conciv/react --filter @conciv/extension-terminal run build && pnpm exec next dev --port ${port}`,
})
