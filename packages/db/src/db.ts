import {createHash} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/protocol/state-types'
import {ne} from 'drizzle-orm'
import type {MigrationMeta} from 'drizzle-orm/migrator'
import {formatToMillis} from 'drizzle-orm/migrator.utils'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrationSql} from './migrations.js'
import {replies, runMessages, runs} from './run-schema.js'
import {foldRunMessagesIntoImageHistory, runSessions} from './run-queries.js'

function bundledMigrations(): MigrationMeta[] {
  return Object.entries(migrationSql)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, query]) => ({
      sql: query.split('--> statement-breakpoint'),
      bps: true,
      folderMillis: formatToMillis(name.slice(0, 14)),
      hash: createHash('sha256').update(query).digest('hex'),
      name,
    }))
}

export type ConcivDb = ReturnType<typeof drizzle>

export function openDb(stateRoot: string): ConcivDb {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(join(concivStateDir(stateRoot), 'conciv.db'), {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrateSync(bundledMigrations(), db._.session)
  db.update(runs).set({status: 'idle', updatedAt: Date.now()}).where(ne(runs.status, 'idle')).run()
  for (const sessionId of runSessions(db)) foldRunMessagesIntoImageHistory(db, sessionId)
  db.delete(runMessages).run()
  db.delete(replies).run()
  return db
}
