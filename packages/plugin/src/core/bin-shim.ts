import {mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

// Symlink the @devgent/cli bin onto the agent's PATH so its `devgent tools …` calls resolve.
// Returns the PATH (binDir prepended) for childEnv. Best effort — falls back to PATH's `devgent`.
export function installDevgentBinShim(stateDir: string): string {
  const binDir = join(stateDir, 'bin')
  mkdirSync(binDir, {recursive: true})
  try {
    const shim = join(binDir, 'devgent')
    rmSync(shim, {force: true})
    symlinkSync(require.resolve('@devgent/cli/bin'), shim)
  } catch {
    // best effort
  }
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}
