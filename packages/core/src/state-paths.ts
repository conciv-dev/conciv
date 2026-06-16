import {join} from 'node:path'

// The `.aidx/` layout under the state root, named in one place.
export type StatePaths = {
  dir: string
  lockFor: (sessionId: string) => string
  sessionsDir: string
  systemPrompt: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.aidx')
  return {
    dir,
    lockFor: (sessionId) => join(dir, `agent.${sessionId}.lock`),
    sessionsDir: join(dir, 'sessions'),
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
