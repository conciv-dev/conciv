import {access, stat} from 'node:fs/promises'
import {delimiter, join} from 'node:path'
import {INIT_HARNESS_IDS, type InitHarnessId} from '@conciv/protocol/harness-types'
import {initContributions} from './registry.js'

export type FoundHarness = {id: InitHarnessId; via: 'path' | 'config'}

async function isExecutable(file: string): Promise<boolean> {
  const info = await stat(file).catch(() => null)
  return info !== null && (info.mode & 0o111) !== 0
}

function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

async function detectHarness(id: InitHarnessId, pathDirs: string[], home: string): Promise<FoundHarness[]> {
  const {bin, configDir} = initContributions[id].detection
  const onPath = await Promise.all(pathDirs.map((pathDir) => isExecutable(join(pathDir, bin))))
  if (onPath.includes(true)) return [{id, via: 'path'}]
  if (await exists(join(home, ...configDir))) return [{id, via: 'config'}]
  return []
}

export async function detectHarnesses(env: {PATH: string; HOME: string}): Promise<FoundHarness[]> {
  const pathDirs = env.PATH.split(delimiter).filter((entry) => entry.length > 0)
  const found = await Promise.all(INIT_HARNESS_IDS.map((id) => detectHarness(id, pathDirs, env.HOME)))
  return found.flat()
}
