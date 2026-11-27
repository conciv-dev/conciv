import {engineRuntimeErrors} from '@conciv/errors'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {it} from '@effect/vitest'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {Effect} from 'effect'
import {describe, expect} from 'vitest'
import {concivStateDir, createConcivStateDir} from '@conciv/types/state-types'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {openDb} from '../../src/db/connection.js'
import {migrations} from '../../src/db/migrations.gen.js'
import {chatRuns} from '../../src/db/run-schema.js'
import {sessions} from '@conciv/backend-app-api/core/session/sql'

describe('restart', () => {
  it.live('a run left running is detached on the next open', () =>
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
  it.live('an opener waits while another opener holds the migration lock, and opens once it is let go', () =>
    Effect.gen(function* () {
      const root = tempDir('state-')
      const other = new DatabaseSync(
        join(yield* Effect.promise(() => createConcivStateDir(concivStateDir(root))), 'conciv.lock'),
      )
      other.exec('BEGIN EXCLUSIVE')

      const refused = yield* openDb(root, {busyTimeoutMs: 50}).pipe(Effect.flip, Effect.scoped)

      expect(refused).toMatchObject({
        code: engineRuntimeErrors.MIGRATION_LOCK_HELD.code,
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
  it.live('a database from the first release opens migrated and keeps its sessions', () =>
    Effect.gen(function* () {
      const root = tempDir('state-')
      const old = drizzle({
        client: new DatabaseSync(
          join(yield* Effect.promise(() => createConcivStateDir(concivStateDir(root))), 'conciv.db'),
        ),
      })
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
