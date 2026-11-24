import {randomUUID} from 'node:crypto'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from '@playwright/test'
import {CONNECT_FIRST_PORT} from '@conciv/protocol/connect-ports'
import {e2eConfig, e2ePort} from '@conciv/e2e-utils/config'
import {e2eStateDir} from '@conciv/e2e-utils/state-dir'

const appPort = await e2ePort('vite-react-component')
process.env.CONCIV_E2E_MOUNT_API_TOKEN ??= randomUUID()
const token = process.env.CONCIV_E2E_MOUNT_API_TOKEN
const tryBin = fileURLToPath(new URL('bin.js', import.meta.resolve('@conciv/try')))
const engineFolders = ['first', 'second'].map((name) =>
  join(dirname(e2eStateDir(import.meta.dirname)), 'vite-react-component-engines', name),
)

function connectEngine(folder: string, index: number) {
  return {
    command: `rm -rf '${folder}' && mkdir -p '${folder}' && cd '${folder}' && node --disable-warning=ExperimentalWarning '${tryBin}' --token ${token} --origin http://localhost:${appPort} --workspace .`,
    url: `http://127.0.0.1:${CONNECT_FIRST_PORT + index}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  }
}

export default defineConfig(
  await e2eConfig('vite-react-component', {
    dir: import.meta.dirname,
    runFolders: engineFolders,
    command: (port, coldStart) => `pnpm exec vite --port ${port} --strictPort ${coldStart}`,
  }),
  {webServer: engineFolders.map(connectEngine)},
)
