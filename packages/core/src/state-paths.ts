import {join} from 'node:path'

// The `.aidx/` layout under the state root, named in one place.
export type StatePaths = {dir: string; lock: string; sessions: string; systemPrompt: string}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.aidx')
  return {
    dir,
    lock: join(dir, 'agent.lock'),
    sessions: join(dir, 'chat-sessions.json'),
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
