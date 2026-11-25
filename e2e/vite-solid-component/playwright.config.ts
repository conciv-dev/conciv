import {e2eConfig} from '@internal/e2e-utils/config'

export default await e2eConfig('vite-solid-component', {
  dir: import.meta.dirname,
  command: (port, coldStart) => `pnpm exec vite --port ${port} --strictPort ${coldStart}`,
})
