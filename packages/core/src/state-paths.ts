import {join} from 'node:path'

export type StatePaths = {
  dir: string
  systemPrompt: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.conciv')
  return {
    dir,
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
