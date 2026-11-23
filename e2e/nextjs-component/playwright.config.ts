import {e2eConfig} from '@conciv/e2e-utils/config'

export default await e2eConfig('nextjs-component', {
  dir: import.meta.dirname,
  command: (port) => `pnpm exec next dev --port ${port}`,
})
