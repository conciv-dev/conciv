import {join} from 'node:path'

export const CONCIV_STATE_DIR = '.conciv'

export function concivStateDir(root: string): string {
  return join(root, CONCIV_STATE_DIR)
}
