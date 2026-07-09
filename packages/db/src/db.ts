import {mkdirSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrate} from 'drizzle-orm/node-sqlite/migrator'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

export type ConcivDb = ReturnType<typeof openDb>

export function openDb(stateRoot: string) {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(`${stateRoot}/.conciv/conciv.db`)
  const db = drizzle({client})
  migrate(db, {migrationsFolder})
  return db
}
