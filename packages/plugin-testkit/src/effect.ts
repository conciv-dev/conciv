import {test, type TestOptions} from 'vitest'
import {Cause, Effect, Exit, Layer, type Scope} from 'effect'
import {TestClock, TestConsole} from 'effect/testing'
import {FetchHttpClient} from 'effect/http'

type Body<A, E, R> = Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>)

type Options = number | Omit<TestOptions, 'shuffle'>

const body = <A, E, R>(value: Body<A, E, R>) => Effect.suspend(() => (typeof value === 'function' ? value() : value))

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]'])

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

const refuseNetwork =
  (violations: string[]): typeof fetch =>
  (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input)
    if (loopback.has(new URL(url).hostname)) return fetch(input, init)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const message = `test attempted network request: ${method} ${url}: provide an explicit HttpClient or disable the fetch`
    violations.push(message)
    return Promise.reject(new Error(message))
  }

const run = <A, E, R, E2>(value: Body<A, E, R | Scope.Scope>, layer: Layer.Layer<R, E2>) =>
  Effect.gen(function* () {
    const violations: string[] = []
    const exit = yield* body(value).pipe(
      Effect.scoped,
      Effect.provide(layer),
      Effect.provideService(FetchHttpClient.Fetch, refuseNetwork(violations)),
      Effect.exit,
    )
    if (Exit.isFailure(exit)) {
      for (const err of Cause.prettyErrors(exit.cause)) {
        yield* Effect.logError(err)
      }
    }
    if (violations.length > 0) return yield* Effect.fail(new Error(violations.join('\n')))
    return yield* exit
  }).pipe(Effect.runPromise)

const collector = (opts: Options | undefined) => (typeof opts === 'number' ? {timeout: opts} : (opts ?? {}))

type Run<R> = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) => void

export interface Runner<R> extends Run<R> {
  readonly only: Run<R>
  readonly skip: Run<R>
}

export interface TestEffect<R> {
  readonly effect: Runner<R>
  readonly live: Runner<R>
}

const make = <R, E>(testLayer: Layer.Layer<R, E>, liveLayer: Layer.Layer<R, E>): TestEffect<R> => {
  const effect = Object.assign(
    <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) =>
      test(name, collector(opts), () => run(value, testLayer)),
    {
      only: <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) =>
        test.only(name, collector(opts), () => run(value, testLayer)),
      skip: <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) =>
        test.skip(name, collector(opts), () => run(value, testLayer)),
    },
  )

  const live = Object.assign(
    <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) =>
      test(name, collector(opts), () => run(value, liveLayer)),
    {
      only: <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) =>
        test.only(name, collector(opts), () => run(value, liveLayer)),
      skip: <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: Options) =>
        test.skip(name, collector(opts), () => run(value, liveLayer)),
    },
  )

  return {effect, live}
}

const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

const liveEnv = TestConsole.layer

export const testEffect = <R, E>(layer: Layer.Layer<R, E>): TestEffect<R> =>
  make(Layer.provideMerge(layer, testEnv), Layer.provideMerge(layer, liveEnv))
