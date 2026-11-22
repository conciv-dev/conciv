import {existsSync, mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createConcivStateDir} from '@conciv/protocol/state-types'
import {fileURLToPath} from 'node:url'

function linkConcivBin(binDir: string): void {
  const target = fileURLToPath(import.meta.resolve('@conciv/cli/bin'))
  if (!existsSync(target)) throw new Error(`${target} does not exist`)
  const shim = join(binDir, 'conciv')
  rmSync(shim, {force: true})
  symlinkSync(target, shim)
}

export async function installConcivBinShim(stateDir: string): Promise<string> {
  const binDir = join(stateDir, 'bin')
  try {
    await createConcivStateDir(stateDir)
    mkdirSync(binDir, {recursive: true})
    linkConcivBin(binDir)
  } catch (error) {
    console.error('conciv: could not link the conciv command into', binDir, error)
  }
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}
