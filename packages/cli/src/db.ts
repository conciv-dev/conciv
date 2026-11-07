import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {defineCommand} from 'citty'
import {readOnlyQuery} from '@conciv/db/read-only-query'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'

export const dbCommand = defineCommand({
  meta: {name: 'db', description: 'read the conciv database (.conciv/conciv.db)'},
  subCommands: {
    query: defineCommand({
      meta: {name: 'query', description: 'run one read-only SELECT over .conciv/conciv.db and print the rows'},
      args: {sql: {type: 'positional', required: true, description: 'one SELECT or WITH ... SELECT statement'}},
      run: ({args}) => queried(args.sql),
    }),
  },
})

const DB_FILE = 'conciv.db'

function queried(sql: string): CliOutcome {
  const file = dbFileFrom(process.cwd())
  if (file === null) {
    throw userFailure(`no .conciv/${DB_FILE} in ${process.cwd()} or above`, {
      hint: 'run it from the project the conciv engine serves',
    })
  }
  try {
    return {report: 'json', data: readOnlyQuery({file, sql})}
  } catch (error) {
    throw userFailure(error instanceof Error ? error.message : String(error))
  }
}

function dbFileFrom(directory: string): string | null {
  const file = join(concivStateDir(directory), DB_FILE)
  if (existsSync(file)) return file
  const parent = dirname(directory)
  return parent === directory ? null : dbFileFrom(parent)
}
