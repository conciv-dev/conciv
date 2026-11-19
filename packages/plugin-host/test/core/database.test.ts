import {describe, expect, test} from 'vitest'
import {chmod, stat, writeFile} from 'node:fs/promises'
import path from 'path'
import {Effect, Layer} from 'effect'
import {Database} from '../../src/core/database/database.js'
import {openDb} from '@conciv/db'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {tmpdir} from './fixture/tmpdir'

const openModes = (filename: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Layer.build(Database.layer({path: filename}))
      return yield* Effect.promise(() =>
        Promise.all(['', '-wal', '-shm'].map(async (suffix) => (await stat(filename + suffix)).mode & 0o777)),
      )
    }).pipe(Effect.scoped),
  )

describe.skipIf(process.platform === 'win32')('Database file permissions', () => {
  test('creates the database and sidecars readable only by the owner', async () => {
    await using tmp = await tmpdir()

    expect(await openModes(path.join(tmp.path, 'conciv.db'))).toEqual([0o600, 0o600, 0o600])
  })

  test('leaves the modes of a database and sidecars it did not create as they were', async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, 'conciv.db')
    await Promise.all(
      ['', '-wal', '-shm'].map(async (suffix) => {
        await writeFile(filename + suffix, '')
        await chmod(filename + suffix, 0o644)
      }),
    )

    expect(await openModes(filename)).toEqual([0o644, 0o644, 0o644])
  })
})

describe('Database on the project database', () => {
  test('creates no table and runs no migration on a database conciv has migrated, whose plugin host tables are there', async () => {
    await using tmp = await tmpdir()
    await Effect.runPromise(
      Effect.gen(function* () {
        const conciv = yield* openDb(tmp.path)
        const tableNames = conciv.$client
          .unsafe<{name: string}>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .pipe(Effect.map((rows) => rows.map((row) => row.name)))
        const before = yield* tableNames
        expect(before).toEqual(expect.arrayContaining(['event', 'event_sequence', 'kv', 'permission']))

        yield* Layer.build(Database.configuredClient(Layer.succeed(SqliteClient.SqliteClient, conciv.$client)))

        expect(yield* tableNames).toEqual(before)
      }).pipe(Effect.scoped),
    )
  })
})
