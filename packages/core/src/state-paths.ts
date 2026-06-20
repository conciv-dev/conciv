import {join} from 'node:path'

// The `.mandarax/` layout under the state root, named in one place.
export type StatePaths = {
  dir: string
  lockFor: (sessionId: string) => string
  sessionsDir: string
  canvasDir: string
  systemPrompt: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.mandarax')
  return {
    dir,
    lockFor: (sessionId) => join(dir, `agent.${sessionId}.lock`),
    sessionsDir: join(dir, 'sessions'),
    canvasDir: join(dir, 'canvas'),
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
