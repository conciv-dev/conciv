import {INIT_HARNESS_IDS, type HarnessInit, type InitHarnessId} from '@conciv/protocol/harness-types'
import {initContributions} from '@conciv/harness-init/registry'

export type HarnessId = InitHarnessId

export const harnessIds: HarnessId[] = [...INIT_HARNESS_IDS]

export const harnessFileInits: HarnessInit<HarnessId>[] = harnessIds.flatMap((id) => {
  const contribution = initContributions[id]
  return contribution.init === 'files' ? [contribution] : []
})

export function harnessAgentsMdNote(id: HarnessId): string | undefined {
  return initContributions[id].agentsMdNote
}
