import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from './migrations.gen.js'
import {importLegacyThreads} from './chat-thread-import.js'
import {openMigratedDb} from './open/migrated-db.js'
import {importLegacyRuns, markRunningRunsDetached} from './run-migrations.js'

export type ConcivDb = ReturnType<typeof drizzle>

export function openDb(stateRoot: string): ConcivDb {
  const stateDir = concivStateDir(stateRoot)
  mkdirSync(stateDir, {recursive: true})
  return openMigratedDb({
    file: join(stateDir, 'conciv.db'),
    lock: join(stateDir, 'conciv.lock'),
    migrate: (db) => {
      migrateSync(migrations, db._.session)
      const now = Date.now()
      importLegacyRuns(db)
      importLegacyThreads(db, now)
      markRunningRunsDetached(db, now)
    },
  })
}
