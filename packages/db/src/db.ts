import {mkdirSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {ne} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrate} from 'drizzle-orm/node-sqlite/migrator'
import {replies, runs} from './run-schema.js'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

export type ConcivDb = ReturnType<typeof drizzle>

export function openDb(stateRoot: string): ConcivDb {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(`${stateRoot}/.conciv/conciv.db`, {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrate(db, {migrationsFolder})
  db.update(runs).set({status: 'idle', updatedAt: Date.now()}).where(ne(runs.status, 'idle')).run()
  db.delete(replies).run()
  return db
}
