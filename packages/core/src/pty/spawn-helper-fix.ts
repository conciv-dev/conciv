import {accessSync, chmodSync, existsSync, constants} from 'node:fs'
import {dirname, join} from 'node:path'
import {createRequire} from 'node:module'

export function ensureSpawnHelperExecutable(): void {
  if (process.platform !== 'darwin') return
  const helper = resolveSpawnHelper()
  if (!helper || !existsSync(helper)) return
  try {
    accessSync(helper, constants.X_OK)
  } catch {
    chmodSync(helper, 0o755)
  }
}

function resolveSpawnHelper(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const platformRequire = createRequire(require.resolve('@lydell/node-pty'))
    const packageRoot = dirname(platformRequire.resolve(`@lydell/node-pty-darwin-${process.arch}/package.json`))
    return join(packageRoot, 'spawn-helper')
  } catch {
    return null
  }
}
