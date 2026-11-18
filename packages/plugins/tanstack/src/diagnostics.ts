import type * as Bundler from '@conciv/plugin/schema/bundler'
import {Context, Effect, Layer, Ref} from 'effect'
import type {AppError} from './rpc.js'

type BuildErrorDiagnostic = Extract<Bundler.Diagnostic, {kind: 'build-error'}>

const CAPACITY = 50

export interface DiagnosticsRing {
  readonly observe: (diagnostic: Bundler.Diagnostic) => Effect.Effect<void>
  readonly list: Effect.Effect<ReadonlyArray<AppError>>
}

export const DiagnosticsService = Context.Service<DiagnosticsRing>('@conciv/plugin-tanstack/Diagnostics')

function buildErrorToAppError(diagnostic: BuildErrorDiagnostic): AppError {
  const line = diagnostic.loc?.line ?? 0
  const column = diagnostic.loc?.column ?? 0
  const source = diagnostic.file ? {file: diagnostic.file, line, column} : null
  return {
    id: `build:${diagnostic.file ?? 'unknown'}:${line}:${column}:${diagnostic.timestamp}`,
    kind: 'build',
    message: diagnostic.message,
    stack: null,
    source,
    digest: null,
    at: diagnostic.timestamp,
  }
}

const make = Effect.fn('tanstack.diagnostics.make')(function* () {
  const ring = yield* Ref.make<ReadonlyArray<AppError>>([])
  const observe = Effect.fn('tanstack.diagnostics.observe')(function* (diagnostic: Bundler.Diagnostic) {
    if (diagnostic.kind !== 'build-error') return
    const error = buildErrorToAppError(diagnostic)
    yield* Ref.update(ring, (stored) => [...stored, error].slice(-CAPACITY))
  })
  const service: DiagnosticsRing = {observe, list: Ref.get(ring)}
  return service
})

export const diagnosticsLayer = Layer.effect(DiagnosticsService)(make())
