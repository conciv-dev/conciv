import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/protocol/state-types'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from './migrations.gen.js'
import {importLegacyThreads} from './chat-thread-import.js'
import {importLegacyRuns, markRunningRunsDetached} from './run-store.js'

export type ConcivDb = ReturnType<typeof drizzle>

export function openDb(stateRoot: string): ConcivDb {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(join(concivStateDir(stateRoot), 'conciv.db'), {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrateSync(migrations, db._.session)
  const now = Date.now()
  importLegacyRuns(db)
  importLegacyThreads(db, now)
  markRunningRunsDetached(db, now)
  return db
}
