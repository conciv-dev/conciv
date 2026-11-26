import {e2eConfig} from '@internal/e2e-utils/config'

export default await e2eConfig('vite-react-component', {
  dir: import.meta.dirname,
  command: (port, coldStart) => `pnpm exec vite --port ${port} --strictPort ${coldStart}`,
})
