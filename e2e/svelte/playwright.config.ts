import {e2eConfig} from '@internal/e2e-utils/config'

export default await e2eConfig('svelte', {
  dir: import.meta.dirname,
  command: (port, coldStart) => `pnpm exec vite dev --port ${port} --strictPort ${coldStart}`,
})
