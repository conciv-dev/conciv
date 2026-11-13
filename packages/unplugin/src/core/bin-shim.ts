import {mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)

export function installConcivBinShim(stateDir: string): string {
  const binDir = join(stateDir, 'bin')
  mkdirSync(binDir, {recursive: true})
  try {
    const shim = join(binDir, 'conciv')
    rmSync(shim, {force: true})
    symlinkSync(require.resolve('@conciv/cli/bin'), shim)
  } catch {}
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}
