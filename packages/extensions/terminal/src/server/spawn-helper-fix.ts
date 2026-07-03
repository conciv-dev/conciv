import {accessSync, chmodSync, existsSync, constants} from 'node:fs'
import {dirname, join} from 'node:path'
import {createRequire} from 'node:module'

export function ensureSpawnHelperExecutable(): void {
  if (process.platform !== 'darwin') return
  const require = createRequire(import.meta.url)
  const packageRoot = dirname(require.resolve('node-pty/package.json'))
  const helper = join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
  if (!existsSync(helper)) return
  try {
    accessSync(helper, constants.X_OK)
  } catch {
    chmodSync(helper, 0o755)
  }
}
