import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'

export function stateRoot(input: {cwd: string; env: NodeJS.ProcessEnv}): string | undefined {
  const declared = input.env.CONCIV_STATE_ROOT
  if (declared !== undefined && declared !== '') return declared
  return discovered(input.cwd)
}

function discovered(directory: string): string | undefined {
  if (existsSync(join(concivStateDir(directory), 'conciv.db'))) return directory
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return discovered(parent)
}
