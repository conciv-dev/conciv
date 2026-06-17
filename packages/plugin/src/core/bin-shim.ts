import {mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

// Symlink the @opendui/aidx-cli bin onto the agent's PATH so its `aidx tools …` calls resolve.
// Returns the PATH (binDir prepended) for childEnv. Best effort — falls back to PATH's `aidx`.
export function installAidxBinShim(stateDir: string): string {
  const binDir = join(stateDir, 'bin')
  mkdirSync(binDir, {recursive: true})
  try {
    const shim = join(binDir, 'aidx')
    rmSync(shim, {force: true})
    symlinkSync(require.resolve('@opendui/aidx-cli/bin'), shim)
  } catch {
    // best effort
  }
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}
