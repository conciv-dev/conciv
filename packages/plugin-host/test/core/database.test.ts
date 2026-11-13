import {describe, expect, test} from 'vitest'
import {chmod, stat, writeFile} from 'node:fs/promises'
import path from 'path'
import {Effect, Layer} from 'effect'
import {Database} from '../../src/core/database/database.js'
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

  test('tightens an existing database and sidecars', async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, 'opencode.db')
    await Promise.all(
      ['', '-wal', '-shm'].map(async (suffix) => {
        await writeFile(filename + suffix, '')
        await chmod(filename + suffix, 0o644)
      }),
    )

    expect(await openModes(filename)).toEqual([0o600, 0o600, 0o600])
  })
})
