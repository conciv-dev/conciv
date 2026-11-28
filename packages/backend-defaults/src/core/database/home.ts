import {join} from 'node:path'
import {Effect, Layer} from 'effect'
import {causeFrom, engineRuntimeErrors} from '@conciv/errors'
import {prepareHome, withHomeDb} from '@conciv/home'
import {layer} from './layer.js'

const migratedHome = Effect.fn('core.database.home')(function* (home: string) {
  const unreachable = (cause: unknown) => engineRuntimeErrors.HOME_UNREACHABLE({home, ...causeFrom(cause)})
  const prepared = yield* Effect.tryPromise({try: () => prepareHome(home), catch: unreachable})
  yield* Effect.try({try: () => withHomeDb(prepared, () => undefined), catch: unreachable})
  return join(prepared, 'home.db')
})

export function homeLayer(home: string) {
  return Layer.unwrap(migratedHome(home).pipe(Effect.map((path) => layer({path})))).pipe(Layer.orDie)
}
