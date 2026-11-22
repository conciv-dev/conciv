import {e2eConfig} from '@conciv/e2e-utils/config'

export default await e2eConfig('vite-solid', {
  dir: import.meta.dirname,
  browserSettings: ['storage-refused'],
  command: (port, coldStart) => `pnpm exec vite --port ${port} --strictPort ${coldStart}`,
})
