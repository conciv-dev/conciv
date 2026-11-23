import {defineConfig} from '@playwright/test'
import {e2ePort, packedE2eConfig} from '@conciv/e2e-utils/config'
import {PACKED_ROOT, packedAppDir} from './packed/packed-app-dir.ts'

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
      },
    },
    {
      name: 'webpack',
      command: (port) => `pnpm exec next dev --webpack --port ${port}`,
      cwd: packedAppDir('webpack'),
      env: {
        CONCIV_E2E_ENGINE_PORT: String(await e2ePort('webpack-engine')),
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
