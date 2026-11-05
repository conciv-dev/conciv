import {INIT_HARNESS_IDS, initContributions, type InitHarnessId} from '@conciv/harness-init/registry'
import type {HarnessInit} from '@conciv/protocol/harness-types'

export type HarnessId = InitHarnessId

export const harnessIds: HarnessId[] = [...INIT_HARNESS_IDS]

export const harnessFileInits: HarnessInit<HarnessId>[] = harnessIds.flatMap((id) => {
  const contribution = initContributions[id]
  return contribution.init === 'files' ? [contribution] : []
})

export function harnessAgentsMdNote(id: HarnessId): string | undefined {
  return initContributions[id].agentsMdNote
}
