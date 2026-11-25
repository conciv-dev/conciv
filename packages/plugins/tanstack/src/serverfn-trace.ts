import type * as Bundler from '@conciv/protocol/schema/bundler'
import {Context, Effect, Layer, Option, Ref, Schema} from 'effect'
import {uniqBy} from 'es-toolkit'
import type {ServerFnTrace, ServerFnTraces} from './rpc.js'

type RequestTraceDiagnostic = Extract<Bundler.Diagnostic, {kind: 'request-trace'}>

type Entry = {readonly trace: ServerFnTrace; readonly file: string}

const SERVER_FN_PREFIX = '/_serverFn/'

const CAPACITY = 100

const ServerFnReference = Schema.StringFromBase64.pipe(
  Schema.decodeTo(Schema.fromJsonString(Schema.Struct({file: Schema.String, export: Schema.String}))),
)

const decodeServerFn = Schema.decodeUnknownEffect(ServerFnReference)

export interface ServerFnTraceRing {
  readonly observe: (diagnostic: Bundler.Diagnostic) => Effect.Effect<void>
  readonly read: (count: number | undefined) => Effect.Effect<ServerFnTraces>
}

export const ServerFnTraceService = Context.Service<ServerFnTraceRing>('@conciv/plugin-tanstack/ServerFnTrace')

function encodedSegment(url: string): Option.Option<string> {
  const prefixAt = url.indexOf(SERVER_FN_PREFIX)
  if (prefixAt === -1) return Option.none()
  const rest = url.slice(prefixAt + SERVER_FN_PREFIX.length)
  const end = rest.search(/[/?#]/)
  const segment = end === -1 ? rest : rest.slice(0, end)
  return segment.length > 0 ? Option.some(segment) : Option.none()
}

function toEntry(diagnostic: RequestTraceDiagnostic, segment: string, file: string, name: string): Entry {
  return {
    trace: {
      id: segment,
      name,
      durationMs: diagnostic.durationMs,
      status: diagnostic.status < 400 ? 'ok' : 'error',
      at: diagnostic.timestamp,
    },
    file,
  }
}

const make = Effect.fn('tanstack.serverFnTrace.make')(function* () {
  const ring = yield* Ref.make<ReadonlyArray<Entry>>([])

  const record = Effect.fn('tanstack.serverFnTrace.record')(function* (
    diagnostic: RequestTraceDiagnostic,
    segment: string,
  ) {
    const decoded = yield* decodeServerFn(segment).pipe(
      Effect.tapError((error) =>
        Effect.logDebug('tanstack: undecodable server-function request').pipe(
          Effect.annotateLogs({url: diagnostic.url, reason: error.message}),
        ),
      ),
      Effect.option,
    )
    if (Option.isNone(decoded)) return
    const entry = toEntry(diagnostic, segment, decoded.value.file, decoded.value.export)
    yield* Ref.update(ring, (stored) => [...stored, entry].slice(-CAPACITY))
  })

  const observe = Effect.fn('tanstack.serverFnTrace.observe')(function* (diagnostic: Bundler.Diagnostic) {
    if (diagnostic.kind !== 'request-trace') return
    const segment = encodedSegment(diagnostic.url)
    if (Option.isNone(segment)) return
    yield* record(diagnostic, segment.value)
  })

  const read = Effect.fn('tanstack.serverFnTrace.read')(function* (count: number | undefined) {
    const stored = yield* Ref.get(ring)
    const latest = count === undefined ? stored : stored.slice(-count)
    return {
      traces: latest.map((entry) => entry.trace),
      functions: uniqBy(stored, (entry) => entry.trace.id).map((entry) => ({
        id: entry.trace.id,
        name: entry.trace.name,
        route: null,
        file: entry.file,
      })),
    }
  })

  const service: ServerFnTraceRing = {observe, read}
  return service
})

export const serverFnTraceLayer = Layer.effect(ServerFnTraceService)(make())
