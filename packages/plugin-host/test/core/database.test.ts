import {describe, expect, test} from 'vitest'
import {chmod, stat, writeFile} from 'node:fs/promises'
import path from 'path'
import {Effect, Layer} from 'effect'
import {Database} from '../../src/core/database/database.js'
import {openDb} from '@conciv/db'
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

    expect(await openModes(path.join(tmp.path, 'opencode.db'))).toEqual([0o600, 0o600, 0o600])
  })

  test('leaves the modes of a database and sidecars it did not create as they were', async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, 'opencode.db')
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
    const conciv = openDb(tmp.path)
    const filename = conciv.$client.location() ?? ':memory:'
    const tableNames = () =>
      conciv.$client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => row.name)
    const before = tableNames()
    expect(before).toEqual(expect.arrayContaining(['event', 'event_sequence', 'kv', 'permission']))

    await Effect.runPromise(Layer.build(Database.layer({path: filename})).pipe(Effect.scoped))

    expect(tableNames()).toEqual(before)
    conciv.$client.close()
  })
})
