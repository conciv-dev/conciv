import {harnessMatrixConfig} from '@conciv/e2e-utils/config'

export default harnessMatrixConfig({
  command: (harness, port) => `pnpm exec vite --config vite.${harness}.config.ts --port ${port} --strictPort --force`,
})
