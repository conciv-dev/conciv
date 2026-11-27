import {makeWithDefaults} from 'drizzle-orm/effect-sqlite-node'
import {Effect, FileSystem, Layer} from 'effect'
import {chmod} from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {Database} from '@conciv/backend-app-api'
import {sqliteLayer, supportsForeignKeyToggle, supportsTuningPragmas} from './sqlite.node.js'

const makeDatabase = makeWithDefaults()

function tuned(db: Database.Interface['db']): Effect.Effect<Database.Interface> {
  return Effect.gen(function* () {
    if (supportsTuningPragmas) {
      yield* db.run('PRAGMA journal_mode = WAL')
      yield* db.run('PRAGMA synchronous = NORMAL')
      yield* db.run('PRAGMA busy_timeout = 5000')
      yield* db.run('PRAGMA cache_size = -64000')
    }
    if (supportsForeignKeyToggle) yield* db.run('PRAGMA foreign_keys = ON')
    return {db}
  }).pipe(Effect.orDie)
}

const databaseLayer = Layer.effect(Database.Service, Effect.flatMap(Effect.orDie(makeDatabase), tuned))

export function layer(options: Database.Options = {path: ':memory:'}) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const provide = (filename: string) => databaseLayer.pipe(Layer.provide(sqliteLayer({filename})))
      const filename = options.path ?? ':memory:'
      if (filename === ':memory:') return provide(filename)
      const fs = yield* FileSystem.FileSystem
      if (yield* fs.exists(filename).pipe(Effect.orElseSucceed(() => false))) return provide(filename)
      yield* Effect.promise(() => restrictToOwner(filename))
      return provide(filename)
    }),
  )
}

async function restrictToOwner(filename: string) {
  if (process.platform === 'win32') return
  new DatabaseSync(filename).close()
  await chmod(filename, 0o600)
  await Promise.all(
    [`${filename}-wal`, `${filename}-shm`].map((file) =>
      chmod(file, 0o600).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      }),
    ),
  )
}

export function configured(options?: Database.Options) {
  return layer(options)
}

export function configuredClient(db: Database.Interface['db']): Layer.Layer<Database.Interface> {
  return Layer.effect(Database.Service, tuned(db))
}
