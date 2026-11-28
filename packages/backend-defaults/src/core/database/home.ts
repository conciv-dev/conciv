import {join} from 'node:path'
import {Layer} from 'effect'
import type {EvlogError} from 'evlog'
import {causeFrom, engineErrors} from '@conciv/errors'
import {closeHomeDb, openHomeDb, prepareHome, type HomeDb, type PreparedHome} from '@conciv/home'
import {Credential} from '@conciv/backend-app-api'
import {layer} from './layer.js'

export type HomeDatabase =
  | {readonly ok: true; readonly prepared: PreparedHome; readonly db: HomeDb}
  | {readonly ok: false; readonly error: EvlogError}

export async function openHomeDatabase(home: string): Promise<HomeDatabase> {
  try {
    const prepared = await prepareHome(home)
    return {ok: true, prepared, db: openHomeDb(prepared)}
  } catch (cause) {
    return {
      ok: false,
      error: engineErrors.HOME_UNREACHABLE({
        message: `the conciv home ${home} could not be opened`,
        ...causeFrom(cause),
      }),
    }
  }
}

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
