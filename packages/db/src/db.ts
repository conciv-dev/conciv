import type {drizzle} from 'drizzle-orm/node-sqlite'
import type {MigrationMeta} from 'drizzle-orm/migrator'
import {migratedDb} from './migrated-db.js'

export type ConcivDb = ReturnType<typeof drizzle>

export type ExtensionMigrations = {name: string; migrations?: readonly MigrationMeta[]}

export function openDb(input: {stateRoot: string; extensions?: readonly ExtensionMigrations[]}): ConcivDb {
  return migratedDb(input)
}
