import {join} from 'node:path'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {concivStateDir, createConcivStateDir} from '@conciv/protocol/state-types'
import {sql} from 'drizzle-orm'
import {makeWithDefaults} from 'drizzle-orm/effect-sqlite-node'
import {migrate} from 'drizzle-orm/sqlite-core/effect/session'
import {Effect, Layer, Schema} from 'effect'
import {migrations} from './migrations.gen.js'
import {takeMigrationLock} from './open/migrated-db.js'
import {markRunningRunsDetached} from './run-migrations.js'

const makeConcivDb = makeWithDefaults()

export type ConcivDb = Effect.Success<typeof makeConcivDb>

export const MigrationLockError = Schema.TaggedStruct('ConcivDb.MigrationLockError', {
  lockFile: Schema.String,
  cause: Schema.Defect(),
})
export type MigrationLockError = typeof MigrationLockError.Type

function whileMigrationLockHeld<A, E, R>(
  lockFile: string,
  busyTimeoutMs: number | undefined,
  run: Effect.Effect<A, E, R>,
) {
  return Effect.acquireUseRelease(
    Effect.try({
      try: () => takeMigrationLock(lockFile, undefined, busyTimeoutMs),
      catch: (cause) => MigrationLockError.make({lockFile, cause}),
    }),
    () => run,
    (lock) => Effect.sync(() => lock.close()),
  )
}

const movedMigration = {from: '20261115164723_draft_items', to: '20261119142244_draft_items'}

const renameMovedMigration = Effect.fn('db.migrations.renameMoved')(function* (db: ConcivDb) {
  const named = yield* db._.session.objects(
    sql`SELECT 1 FROM pragma_table_info('__drizzle_migrations') WHERE name = 'name'`,
  )
  if (named.length === 0) return
  yield* db._.session.run(
    sql`UPDATE __drizzle_migrations SET name = ${movedMigration.to} WHERE name = ${movedMigration.from}`,
  )
})

const migrateConcivDb = Effect.fn('db.migrations.migrate')(function* (db: ConcivDb) {
  yield* renameMovedMigration(db)
  yield* migrate(migrations, db._.session)
  yield* markRunningRunsDetached(db, Date.now())
})

export type OpenDbOptions = {busyTimeoutMs?: number}

export const openDb = Effect.fn('db.conciv.open')(function* (stateRoot: string, options: OpenDbOptions = {}) {
  const stateDir = createConcivStateDir(concivStateDir(stateRoot))
  const client = yield* Layer.build(SqliteClient.layer({filename: join(stateDir, 'conciv.db')}))
  const db = yield* makeConcivDb.pipe(Effect.provide(client))
  yield* whileMigrationLockHeld(join(stateDir, 'conciv.lock'), options.busyTimeoutMs, migrateConcivDb(db))
  return db
})
