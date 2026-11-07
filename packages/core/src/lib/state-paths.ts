import {join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'

export type StatePaths = {
  dir: string
  server: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = concivStateDir(stateRoot)
  return {
    dir,
    server: join(dir, 'server.json'),
  }
}
