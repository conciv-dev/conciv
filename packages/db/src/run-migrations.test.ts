import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {openDb} from './db.js'
import {chatRuns} from './run-schema.js'

describe('restart', () => {
  it('a run left running is detached on the next open', async () => {
    const root = tempDir('state-')
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openDb(root)
          yield* db.insert(chatRuns).values([
            {runId: 'finished', threadId: 'thread', harnessId: 'claude', status: 'completed', startedAt: 1},
            {runId: 'left', threadId: 'thread', harnessId: 'claude', status: 'running', startedAt: 2},
          ])
        }),
      ),
    )

    const runs = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openDb(root)
          return yield* db
            .select({runId: chatRuns.runId, status: chatRuns.status, detachedSince: chatRuns.detachedSince})
            .from(chatRuns)
            .orderBy(chatRuns.runId)
        }),
      ),
    )

    expect(runs).toEqual([
      {runId: 'finished', status: 'completed', detachedSince: null},
      {runId: 'left', status: 'running', detachedSince: expect.any(Number)},
    ])
  })
})
