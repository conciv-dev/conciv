import {existsSync, statSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {INIT_HARNESS_IDS, type InitHarnessId} from '@conciv/protocol/harness-types'
import {initContributions} from './registry.js'

export type FoundHarness = {id: InitHarnessId; via: 'path' | 'config'}

function isExecutable(file: string): boolean {
  if (!existsSync(file)) return false
  return (statSync(file).mode & 0o111) !== 0
}

export function detectHarnesses(env: {PATH: string; HOME: string}): FoundHarness[] {
  const pathDirs = env.PATH.split(delimiter).filter((entry) => entry.length > 0)
  return INIT_HARNESS_IDS.flatMap((id): FoundHarness[] => {
    const {bin, configDir} = initContributions[id].detection
    if (pathDirs.some((pathDir) => isExecutable(join(pathDir, bin)))) return [{id, via: 'path'}]
    if (existsSync(join(env.HOME, ...configDir))) return [{id, via: 'config'}]
    return []
  })
}
