import {e2eConfig} from '@conciv/e2e-utils/config'

export default await e2eConfig('nextjs', {
  dir: import.meta.dirname,
  pluginCopies: ['live-line'],
  command: (port) => `pnpm exec next dev --port ${port}`,
})
