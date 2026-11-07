import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/protocol/state-types'

export function dbFile(stateRoot: string): {path: string; open: () => DatabaseSync} {
  const path = join(concivStateDir(stateRoot), 'conciv.db')
  return {path, open: () => new DatabaseSync(path, {timeout: 5000})}
}
