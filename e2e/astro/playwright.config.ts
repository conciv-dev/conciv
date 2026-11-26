import {e2eConfig} from '@internal/e2e-utils/config'

export default await e2eConfig('astro', {
  dir: import.meta.dirname,
  command: (port) => `rm -rf node_modules/.vite && pnpm exec astro dev --port ${port} --ignore-lock`,
})
