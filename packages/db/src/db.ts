import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/protocol/state-types'
import {ne} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from './migrations.gen.js'
import {replies, runMessages, runs} from './run-schema.js'
import {foldRunMessagesIntoImageHistory, runSessions} from './run-queries.js'

export type ConcivDb = ReturnType<typeof drizzle>

export function openDb(stateRoot: string): ConcivDb {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(join(concivStateDir(stateRoot), 'conciv.db'), {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrateSync(migrations, db._.session)
  db.update(runs).set({status: 'idle', updatedAt: Date.now()}).where(ne(runs.status, 'idle')).run()
  for (const sessionId of runSessions(db)) foldRunMessagesIntoImageHistory(db, sessionId)
  db.delete(runMessages).run()
  db.delete(replies).run()
  return db
}
