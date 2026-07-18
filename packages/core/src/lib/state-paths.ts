import {join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'

export type StatePaths = {
  dir: string
  systemPrompt: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = concivStateDir(stateRoot)
  return {
    dir,
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
