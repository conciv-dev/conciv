import {existsSync} from 'node:fs'
import {sql} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrations} from './migrations.gen.js'
import type {ConcivDb} from './db.js'
import {dbFile} from './db-file.js'

export function existingDb(input: {stateRoot: string}): ConcivDb {
  const file = dbFile(input.stateRoot)
  const {path} = file
  if (!existsSync(path)) throw new Error(`no conciv database at ${path}`)
  const db = drizzle({client: file.open()})
  const tables = new Set(
    db.all<{name: string}>(sql`select name from sqlite_master where type = 'table'`).map((row) => row.name),
  )
  if (!tables.has(MIGRATIONS_TABLE) || !tables.has(CATALOG_TABLE))
    throw new Error(`${path} has no source catalog yet; run the app with conciv once so the engine writes it`)
  const known = new Set(migrations.map((migration) => migration.name))
  const applied = db.all<{name: string | null}>(sql`select name from ${sql.identifier(MIGRATIONS_TABLE)}`)
  const newer = applied.flatMap((row) =>
    row.name !== null && isCore(row.name) && !known.has(row.name) ? [row.name] : [],
  )
  if (newer.length > 0)
    throw new Error(
      `${path} was migrated by a newer conciv engine (${newer.join(', ')}); update the conciv CLI to read it`,
    )
  return db
}

const MIGRATIONS_TABLE = '__drizzle_migrations'

const CATALOG_TABLE = 'sources'

function isCore(name: string): boolean {
  const [stamp = ''] = name.split('_')
  return stamp !== '' && Number.isInteger(Number(stamp))
}
