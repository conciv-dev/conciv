import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {openMigratedDb} from '@conciv/db'
import {runsMigrations} from './runs-migrations.gen.js'
import {runsRelations} from './relations.js'

export function openRunsStore(home: string) {
  mkdirSync(home, {recursive: true})
  const file = join(home, 'runs.db')
  const opened = openMigratedDb({
    file,
    lock: join(home, 'runs.lock'),
    migrate: (db) => {
      db.$client.exec('PRAGMA foreign_keys = OFF')
      migrateSync(runsMigrations, db._.session)
    },
  })
  opened.$client.exec('PRAGMA foreign_keys = ON')
  opened.$client.exec('PRAGMA synchronous = NORMAL')
  const reader = new DatabaseSync(file, {readOnly: true})
  reader.exec('PRAGMA query_only = ON')
  return {
    file,
    orm: drizzle({client: opened.$client, relations: runsRelations}),
    reader,
    close: () => {
      reader.close()
      opened.$client.close()
    },
  }
}
