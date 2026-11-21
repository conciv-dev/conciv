import {packedE2eConfig} from '@conciv/e2e-utils/config'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'
import {PACKED_ROOT, packedAppDir} from './packed/packed-app-dir.ts'

const DEV_ENDPOINT_DIR = e2eDevEndpointDir(import.meta.dirname)

export default packedE2eConfig({
  dir: import.meta.dirname,
  runFolders: [PACKED_ROOT],
  servers: [
    {
      name: 'turbopack',
      port: 41751,
      command: (port) => `pnpm exec next dev --port ${port}`,
      cwd: packedAppDir('turbopack'),
      env: {CONCIV_E2E_ENGINE_PORT: '41750', CONCIV_E2E_DEV_ENDPOINT_DIR: DEV_ENDPOINT_DIR},
    },
    {
      name: 'webpack',
      port: 41753,
      command: (port) => `pnpm exec next dev --webpack --port ${port}`,
      cwd: packedAppDir('webpack'),
      env: {CONCIV_E2E_ENGINE_PORT: '41752', CONCIV_E2E_DEV_ENDPOINT_DIR: DEV_ENDPOINT_DIR},
    },
  ],
})
