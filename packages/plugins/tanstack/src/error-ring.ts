import {Clock, Context, Effect, Layer, Ref, Stream} from 'effect'
import type {AppError} from './rpc.js'

const CAPACITY = 50

const MESSAGE_MAX = 2_048

const STACK_MAX = 8_192

const EMPTY_LENGTH = JSON.stringify({errors: []}).length

export interface ErrorRing {
  readonly read: (budget: number) => Effect.Effect<{errors: AppError[]}>
}

export const ErrorRingService = Context.Service<ErrorRing>('@conciv/plugin-tanstack/ErrorRing')

function readMessage(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  return fallback
}

function readStack(value: unknown): string | null {
  if (value instanceof Error && typeof value.stack === 'string') return value.stack
  return null
}

function readRuntimeErrors(stored: ReadonlyArray<AppError>, budget: number): {errors: AppError[]} {
  const lengths = stored.map((error) => JSON.stringify(error).length + 1)
  const totals = lengths.reduceRight<number[]>((sums, length) => [length + (sums[0] ?? EMPTY_LENGTH - 1), ...sums], [])
  return {errors: stored.filter((_, index) => (totals[index] ?? 0) <= budget)}
}

const makeErrorRing = Effect.fn('tanstack.errorRing.make')(function* () {
  const ring = yield* Ref.make<ReadonlyArray<AppError>>([])

  const push = Effect.fn('tanstack.errorRing.push')(function* (message: string, stack: string | null) {
    const at = yield* Clock.currentTimeMillis
    const error: AppError = {
      kind: 'runtime',
      id: crypto.randomUUID(),
      message: message.slice(0, MESSAGE_MAX),
      stack: stack?.slice(0, STACK_MAX) ?? null,
      source: null,
      digest: null,
      at,
    }
    yield* Ref.update(ring, (stored) => [...stored, error].slice(-CAPACITY))
  })

  yield* Stream.fromEventListener<ErrorEvent>(window, 'error').pipe(
    Stream.runForEach((event) => push(event.message, readStack(event.error))),
    Effect.forkScoped({startImmediately: true}),
  )
  yield* Stream.fromEventListener<PromiseRejectionEvent>(window, 'unhandledrejection').pipe(
    Stream.runForEach((event) =>
      push(readMessage(event.reason, 'Unhandled promise rejection'), readStack(event.reason)),
    ),
    Effect.forkScoped({startImmediately: true}),
  )

  const service: ErrorRing = {
    read: (budget) => Ref.get(ring).pipe(Effect.map((stored) => readRuntimeErrors(stored, budget))),
  }
  return service
})

export const errorRingLayer = Layer.effect(ErrorRingService)(makeErrorRing())
