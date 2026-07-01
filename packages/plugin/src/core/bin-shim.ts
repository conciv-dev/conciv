import {mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

// Symlink the @conciv/cli bin onto the agent's PATH so its `conciv tools …` calls resolve.
// Returns the PATH (binDir prepended) for childEnv. Best effort — falls back to PATH's `conciv`.
export function installConcivBinShim(stateDir: string): string {
  const binDir = join(stateDir, 'bin')
  mkdirSync(binDir, {recursive: true})
  try {
    const shim = join(binDir, 'conciv')
    rmSync(shim, {force: true})
    symlinkSync(require.resolve('@conciv/cli/bin'), shim)
  } catch {
    // best effort
  }
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}
