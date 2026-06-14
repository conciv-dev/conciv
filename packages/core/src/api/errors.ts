import {HTTPError, onError, type H3} from 'h3'
import {isRunnerUnavailable} from '@aidx/protocol/runner-types'

// One place to translate known domain errors into HTTP responses. Handlers throw; this maps.
// An HTTPError thrown by a handler already carries its status and passes straight through;
// a runner-unavailable error (thrown deep in an adapter) becomes a 422 instead of a 500.
export function registerErrorHandler(app: H3): void {
  app.use(
    onError((error) => {
      const original = error.cause ?? error
      if (isRunnerUnavailable(original)) {
        return new HTTPError({status: 422, message: original.message, body: {available: false, error: original.message}})
      }
      return undefined
    }),
  )
}
