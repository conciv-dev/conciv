import {e2eConfig, e2ePort} from '@conciv/e2e-utils/config'

process.env.CONCIV_E2E_ENGINE_PORT = String(await e2ePort('nextjs-engine'))

export default await e2eConfig('nextjs', {
  dir: import.meta.dirname,
  pluginCopies: ['live-line'],
  command: (port) => `pnpm exec next dev --port ${port}`,
})
