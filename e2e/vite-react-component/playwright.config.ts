import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('vite-react-component', {
  command: (port) => `pnpm exec vite --port ${port} --strictPort --force`,
})
