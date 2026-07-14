import {e2eConfig} from '@conciv/e2e-utils/config'

export default e2eConfig('astro', {
  command: (port) => `rm -rf node_modules/.vite && pnpm exec astro dev --port ${port}`,
})
