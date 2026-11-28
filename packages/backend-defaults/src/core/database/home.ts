import {join} from 'node:path'
import {Effect, Layer} from 'effect'
import type {EvlogError} from 'evlog'
import {causeFrom, engineErrors} from '@conciv/errors'
import {closeHomeDb, openHomeDb, prepareHome, type HomeDb, type PreparedHome} from '@conciv/home'
import {Credential} from '@conciv/backend-app-api'
import {layer} from './layer.js'

export type HomeDatabase =
  | {readonly ok: true; readonly prepared: PreparedHome; readonly db: HomeDb}
  | {readonly ok: false; readonly error: EvlogError}

export const openHomeDatabase = Effect.fn('core.database.openHome')(function* (home: string) {
  const unreachable = (cause: unknown) =>
    engineErrors.HOME_UNREACHABLE({message: `the conciv home ${home} could not be opened`, ...causeFrom(cause)})
  const prepared = yield* Effect.tryPromise({try: () => prepareHome(home), catch: unreachable})
  const db = yield* Effect.try({try: () => openHomeDb(prepared), catch: unreachable})
  return {prepared, db}
})

export function closeHomeDatabase(home: HomeDatabase): void {
  if (home.ok) closeHomeDb(home.db)
}

const storedCredentials = (file: string) => Credential.layer.pipe(Layer.provide(Layer.fresh(layer({path: file}))))

export function credentialLayer(
  home: HomeDatabase,
): Layer.Layer<Credential.Interface, never, Layer.Services<ReturnType<typeof storedCredentials>>> {
  if (!home.ok) return Layer.succeed(Credential.Service, Credential.unavailable(home.error))
  return storedCredentials(join(home.prepared, 'home.db'))
}
