import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {describe, expect, it} from '@effect/vitest'
import {Effect} from 'effect'
import {concivStateDir, createConcivStateDir} from '@conciv/protocol/state-types'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {openDb} from './db.js'
import {migrations} from './migrations.gen.js'
import {chatRuns} from './run-schema.js'
import {sessions} from './schema.js'

describe('restart', () => {
  it.effect('a run left running is detached on the next open', () =>
    Effect.gen(function* () {
      const root = tempDir('state-')
      yield* Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openDb(root)
          yield* db.insert(chatRuns).values([
            {runId: 'finished', threadId: 'thread', harnessId: 'claude', status: 'completed', startedAt: 1},
            {runId: 'left', threadId: 'thread', harnessId: 'claude', status: 'running', startedAt: 2},
          ])
        }),
      )

      const runs = yield* Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openDb(root)
          return yield* db
            .select({runId: chatRuns.runId, status: chatRuns.status, detachedSince: chatRuns.detachedSince})
            .from(chatRuns)
            .orderBy(chatRuns.runId)
        }),
      )

      expect(runs).toEqual([
        {runId: 'finished', status: 'completed', detachedSince: null},
        {runId: 'left', status: 'running', detachedSince: expect.any(Number)},
      ])
    }),
  )
})

describe('two openers', () => {
  it.effect('an opener waits while another opener holds the migration lock, and opens once it is let go', () =>
    Effect.gen(function* () {
      const root = tempDir('state-')
      const lockFile = join(yield* Effect.promise(() => createConcivStateDir(concivStateDir(root))), 'conciv.lock')
      const other = new DatabaseSync(lockFile)
      other.exec('BEGIN EXCLUSIVE')

      const refused = yield* openDb(root, {busyTimeoutMs: 50}).pipe(Effect.flip, Effect.scoped)

      expect(refused).toMatchObject({
        _tag: 'ConcivDb.MigrationLockError',
        cause: expect.objectContaining({message: 'database is locked'}),
      })

      other.close()
      const opened = yield* openDb(root, {busyTimeoutMs: 50}).pipe(
        Effect.flatMap((db) => db.select({runId: chatRuns.runId}).from(chatRuns)),
        Effect.scoped,
      )

      expect(opened).toEqual([])
    }),
  )
})

describe('upgrade', () => {
  it.effect('a database from the first release opens migrated and keeps its sessions', () =>
    Effect.gen(function* () {
      const root = tempDir('state-')
      const dbFile = join(yield* Effect.promise(() => createConcivStateDir(concivStateDir(root))), 'conciv.db')
      const old = drizzle({client: new DatabaseSync(dbFile)})
      migrateSync(migrations.slice(0, 1), old._.session)
      old.$client.exec(
        "INSERT INTO sessions (id, harness_kind, origin, title, cwd, created_at, updated_at) VALUES ('kept', 'claude', 'chat', 'Release notes', '/workspace', 1, 2)",
      )
      old.$client.close()

      const kept = yield* openDb(root).pipe(
        Effect.flatMap((db) =>
          db.select({id: sessions.id, title: sessions.title, deletedAt: sessions.deletedAt}).from(sessions),
        ),
        Effect.scoped,
      )

      expect(kept).toEqual([{id: 'kept', title: 'Release notes', deletedAt: null}])
    }),
  )
})
