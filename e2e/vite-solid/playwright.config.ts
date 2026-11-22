import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('vite-solid', {
  dir: import.meta.dirname,
  pluginCopies: ['live-line', 'host-controls'],
  browserSettings: ['storage-refused'],
  command: (port) => `pnpm exec vite --port ${port} --strictPort --force`,
})
