import {existsSync, statSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {INIT_HARNESS_IDS, initContributions, type InitHarnessId} from '@conciv/harness-init/registry'
import type {HarnessInit} from '@conciv/protocol/harness-types'

export type HarnessId = InitHarnessId
export type FoundHarness = {id: HarnessId; via: 'path' | 'config'}

export const harnessIds: HarnessId[] = [...INIT_HARNESS_IDS]

export const harnessFileInits: HarnessInit<HarnessId>[] = harnessIds.flatMap((id) => {
  const contribution = initContributions[id]
  return contribution.init === 'files' ? [contribution] : []
})

export function harnessAgentsMdNote(id: HarnessId): string | undefined {
  return initContributions[id].agentsMdNote
}

export function detectHarnesses(env: {PATH: string; HOME: string}): FoundHarness[] {
  const pathDirs = env.PATH.split(delimiter).filter((entry) => entry.length > 0)
  return harnessIds.flatMap((id): FoundHarness[] => {
    const {bin, configDir} = initContributions[id].detection
    if (pathDirs.some((pathDir) => isExecutable(join(pathDir, bin)))) return [{id, via: 'path'}]
    if (existsSync(join(env.HOME, ...configDir))) return [{id, via: 'config'}]
    return []
  })
}

function isExecutable(file: string): boolean {
  if (!existsSync(file)) return false
  return (statSync(file).mode & 0o111) !== 0
}
