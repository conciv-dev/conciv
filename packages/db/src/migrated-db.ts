import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from './migrations.gen.js'
import {importLegacyThreads} from './chat-thread-import.js'
import {importLegacyRuns, markRunningRunsDetached} from './run-migrations.js'
import type {ConcivDb, ExtensionMigrations} from './db.js'
import {dbFile} from './db-file.js'
import {openMigratedDb} from './open/migrated-db.js'

export function migratedDb(input: {stateRoot: string; extensions?: readonly ExtensionMigrations[]}): ConcivDb {
  const stateDir = concivStateDir(input.stateRoot)
  mkdirSync(stateDir, {recursive: true})
  const owned = (input.extensions ?? []).flatMap((extension) =>
    (extension.migrations ?? []).map((migration) => ({...migration, name: `${extension.name}_${migration.name}`})),
  )
  return openMigratedDb({
    file: dbFile(input.stateRoot).path,
    lock: join(stateDir, 'conciv.lock'),
    migrate: (db) => {
      migrateSync([...migrations, ...owned], db._.session)
      const now = Date.now()
      importLegacyRuns(db)
      importLegacyThreads(db, now)
      markRunningRunsDetached(db, now)
    },
  })
}
