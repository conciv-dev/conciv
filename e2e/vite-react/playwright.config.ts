import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('vite-react', {
  dir: import.meta.dirname,
  command: (port, coldStart) => `pnpm exec vite --port ${port} --strictPort ${coldStart}`,
  browserSettings: ['storage-refused', 'pop-out-refused'],
})
