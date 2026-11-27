import {log} from 'evlog'
import {access, mkdir, rm, symlink} from 'node:fs/promises'
import {join, delimiter} from 'node:path'
import {createConcivStateDir} from '@conciv/types/state-types'
import {fileURLToPath} from 'node:url'

async function linkConcivBin(binDir: string): Promise<void> {
  const target = fileURLToPath(import.meta.resolve('@conciv/cli/bin'))
  await access(target)
  const shim = join(binDir, 'conciv')
  await rm(shim, {force: true})
  await symlink(target, shim)
}

export async function installConcivBinShim(stateDir: string): Promise<string> {
  const binDir = join(stateDir, 'bin')
  try {
    await createConcivStateDir(stateDir)
    await mkdir(binDir, {recursive: true})
    await linkConcivBin(binDir)
  } catch (error) {
    log.error({action: 'unplugin', message: 'could not link the conciv command', path: binDir, error})
  }
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}
