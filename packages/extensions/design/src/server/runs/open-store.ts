import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {openMigratedDb} from '@conciv/db'
import {runsMigrations} from '../runs-migrations.gen.js'
import {runsRelations} from './relations.js'

export function openStore(home: string) {
  mkdirSync(home, {recursive: true})
  const file = join(home, 'runs.db')
  const opened = openMigratedDb({
    file,
    lock: join(home, 'runs.lock'),
    migrate: (db) => {
      db.$client.exec('PRAGMA foreign_keys = OFF')
      db.$client.exec('PRAGMA legacy_alter_table = ON')
      migrateSync(runsMigrations, db._.session)
    },
  })
  opened.$client.exec('PRAGMA legacy_alter_table = OFF')
  opened.$client.exec('PRAGMA foreign_keys = ON')
  opened.$client.exec('PRAGMA synchronous = NORMAL')
  return {
    file,
    orm: drizzle({client: opened.$client, relations: runsRelations}),
    close: () => opened.$client.close(),
  }
}
