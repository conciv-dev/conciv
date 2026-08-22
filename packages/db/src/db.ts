import {mkdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {CONCIV_STATE_DIR, concivStateDir} from '@conciv/protocol/state-types'
import {ne} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from './migrations.gen.js'
import {globalMigrations} from './migrations-global.gen.js'
import {replies, runs} from './run-schema.js'

export type ConcivDb = ReturnType<typeof drizzle>

export function openDb(stateRoot: string): ConcivDb {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(join(concivStateDir(stateRoot), 'conciv.db'), {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrateSync(migrations, db._.session)
  db.update(runs).set({status: 'idle', updatedAt: Date.now()}).where(ne(runs.status, 'idle')).run()
  db.delete(replies).run()
  return db
}

export function defaultGlobalDbHome(): string {
  return join(homedir(), CONCIV_STATE_DIR)
}

export function openGlobalDb(homeDir: string = defaultGlobalDbHome()): ConcivDb {
  mkdirSync(homeDir, {recursive: true})
  const client = new DatabaseSync(join(homeDir, 'conciv.db'), {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrateSync(globalMigrations, db._.session)
  return db
}
