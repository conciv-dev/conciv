import type {HarnessTurn} from '@conciv/protocol/harness-types'

export function buildCodexArgs(turn: HarnessTurn): string[] {
  const head = turn.resumeSessionId ? ['exec', 'resume', turn.resumeSessionId, turn.prompt] : ['exec', turn.prompt]
  const model = turn.model ? ['-m', turn.model] : []
  return [...head, ...model, '--json', '--sandbox', 'workspace-write']
}
