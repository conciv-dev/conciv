import {harnessMatrixConfig} from '@conciv/e2e-utils/config'

export default harnessMatrixConfig({
  dir: import.meta.dirname,
  command: (harness, port) =>
    `node_modules/.bin/vite --config vite.${harness}.config.ts --port ${port} --strictPort --force`,
})
