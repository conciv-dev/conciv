import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('vite-react', {
  dir: import.meta.dirname,
  command: (port) => `pnpm exec vite --port ${port} --strictPort --force`,
  browserSettings: ['storage-refused', 'pop-out-refused'],
})
