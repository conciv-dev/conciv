import {join} from 'node:path'

export type StatePaths = {
  dir: string
  lockFor: (sessionId: string) => string
  sessionsDir: string
  systemPrompt: string
  trailDir: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.conciv')
  return {
    dir,
    lockFor: (sessionId) => join(dir, `agent.${sessionId}.lock`),
    sessionsDir: join(dir, 'sessions'),
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
    trailDir: join(dir, 'trailbase'),
  }
}
