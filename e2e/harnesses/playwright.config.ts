import {harnessMatrixConfig} from '@internal/e2e-utils/config'

export default await harnessMatrixConfig({
  dir: import.meta.dirname,
  command: (port, coldStart) => `node_modules/.bin/vite --port ${port} --strictPort ${coldStart}`,
})
