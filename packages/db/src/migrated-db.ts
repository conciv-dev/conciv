import {mkdirSync} from 'node:fs'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from './migrations.gen.js'
import {importLegacyThreads} from './chat-thread-import.js'
import {importLegacyRuns} from './run-migrations.js'
import type {ConcivDb, ExtensionMigrations} from './db.js'
import {dbFile} from './db-file.js'

export function migratedDb(input: {stateRoot: string; extensions?: readonly ExtensionMigrations[]}): ConcivDb {
  const {stateRoot} = input
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = dbFile(stateRoot).open()
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  const owned = (input.extensions ?? []).flatMap((extension) =>
    (extension.migrations ?? []).map((migration) => ({...migration, name: `${extension.name}_${migration.name}`})),
  )
  migrateSync([...migrations, ...owned], db._.session)
  importLegacyRuns(db)
  importLegacyThreads(db, Date.now())
  return db
}
