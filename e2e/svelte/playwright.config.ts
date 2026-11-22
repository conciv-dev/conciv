import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('svelte', {
  dir: import.meta.dirname,
  command: (port, coldStart) => `pnpm exec vite dev --port ${port} --strictPort ${coldStart}`,
})
