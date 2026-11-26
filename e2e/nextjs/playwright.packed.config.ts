import {defineConfig} from '@playwright/test'
import {e2ePort, packedE2eConfig} from '@internal/e2e-utils/config'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'
import {PACKED_ROOT, packedAppDir} from './packed/packed-app-dir.ts'

const DEV_ENDPOINT_DIR = e2eDevEndpointDir(import.meta.dirname)

const packed = await packedE2eConfig({
  dir: import.meta.dirname,
  runFolders: [PACKED_ROOT],
  servers: [
    {
      name: 'turbopack',
      command: (port) => `pnpm exec next dev --port ${port}`,
      cwd: packedAppDir('turbopack'),
      env: {
        CONCIV_E2E_ENGINE_PORT: String(await e2ePort('turbopack-engine')),
        CONCIV_E2E_DEV_ENDPOINT_DIR: DEV_ENDPOINT_DIR,
      },
    },
    {
      name: 'webpack',
      command: (port) => `pnpm exec next dev --webpack --port ${port}`,
      cwd: packedAppDir('webpack'),
      env: {
        CONCIV_E2E_ENGINE_PORT: String(await e2ePort('webpack-engine')),
        CONCIV_E2E_DEV_ENDPOINT_DIR: DEV_ENDPOINT_DIR,
      },
    },
  ],
})

export default defineConfig({
  ...packed,
  projects: packed.projects?.map((project) =>
    project.name === 'webpack' ? {...project, grepInvert: /trustPolicy: no-downgrade/} : project,
  ),
})
