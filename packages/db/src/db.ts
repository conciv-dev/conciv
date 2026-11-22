import {join} from 'node:path'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {concivStateDir, createConcivStateDir} from '@conciv/protocol/state-types'
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

const migrateConcivDb = Effect.fn('db.migrations.migrate')(function* (db: ConcivDb) {
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
