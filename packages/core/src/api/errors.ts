import {HTTPError, onError, type H3} from 'h3'
import {isRunnerUnavailable} from '@mandarax/protocol/runner-types'

// Maps domain errors to HTTP: a runner-unavailable error becomes 422; HTTPErrors pass through.
export function registerErrorHandler(app: H3): void {
  app.use(
    onError((error) => {
      const original = error.cause ?? error
      if (isRunnerUnavailable(original)) {
        return new HTTPError({
          status: 422,
          message: original.message,
          body: {available: false, error: original.message},
        })
      }
      return undefined
    }),
  )
}
