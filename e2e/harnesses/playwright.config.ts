import {defineConfig} from '@playwright/test'
import {harnessMatrixConfig} from '@conciv/e2e-utils/config'

const PI_SPEC = '**/pi.spec.ts'

const matrix = harnessMatrixConfig({
  dir: import.meta.dirname,
  command: (harness, port) =>
    `node_modules/.bin/vite --config vite.${harness}.config.ts --port ${port} --strictPort --force`,
})

export default defineConfig({
  ...matrix,
  projects: matrix.projects?.map((project) => (project.name === 'pi' ? project : {...project, testIgnore: PI_SPEC})),
})
