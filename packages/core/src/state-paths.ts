import {join} from 'node:path'

// The `.aidx/` layout under the state root, named in one place.
export type StatePaths = {
  dir: string
  lockFor: (sessionId: string) => string
  sessions: string
  titles: string
  usage: string
  systemPrompt: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.aidx')
  return {
    dir,
    lockFor: (sessionId) => join(dir, `agent.${sessionId}.lock`),
    sessions: join(dir, 'chat-sessions.json'),
    titles: join(dir, 'session-titles.json'),
    usage: join(dir, 'chat-usage.json'),
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
