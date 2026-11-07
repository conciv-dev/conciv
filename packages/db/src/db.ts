import type {drizzle} from 'drizzle-orm/node-sqlite'
import type {MigrationMeta} from 'drizzle-orm/migrator'
import {markRunningRunsDetached} from './run-migrations.js'
import {migratedDb} from './migrated-db.js'

export type ConcivDb = ReturnType<typeof drizzle>

export type ExtensionMigrations = {name: string; migrations?: readonly MigrationMeta[]}

export function openDb(input: {stateRoot: string; extensions?: readonly ExtensionMigrations[]}): ConcivDb {
  const db = migratedDb(input)
  markRunningRunsDetached(db, Date.now())
  return db
}
