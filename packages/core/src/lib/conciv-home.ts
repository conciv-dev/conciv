import {homedir} from 'node:os'
import {join} from 'node:path'
import {CONCIV_STATE_DIR} from '@conciv/protocol/state-types'

export function concivHomeDir(): string {
  return join(homedir(), CONCIV_STATE_DIR)
}
