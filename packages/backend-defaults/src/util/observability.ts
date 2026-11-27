import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import {Effect, Layer, Logger, Option, References, Result, Schema} from 'effect'
import {FetchHttpClient} from 'effect/http'
import {OtlpExporter, OtlpSerialization} from 'effect/observability'
import {LogLevelSchema, parseRetention, type Retention} from '@conciv/types/config-types'
import {hostLogger, storeLogger, type LogWriter} from './observability/host-sink.js'
import * as LogStore from './observability/log-store.js'
import * as LogLevel from './observability/log-level.js'
import * as Logging from './observability/logging.js'
import * as Otlp from './observability/otlp.js'
import {makeRunId} from './observability/shared.js'
import {observabilityErrors} from './observability/errors.js'

export const Options = Schema.Struct({
  endpoint: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.String),
  client: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  channel: Schema.optional(Schema.String),
  instance: Schema.optional(Schema.String),
  level: Schema.optional(Schema.Literals(LogLevelSchema.options)),
})
export type Options = typeof Options.Type

function sinks(
  run: string,
  app: {channel: string},
  emit: LogWriter | undefined,
  enabled: LogLevel.Enabled,
  store: LogStore.Interface,
) {
  return [
    LogLevel.gate(enabled, storeLogger(store.drain, app.channel)),
    LogLevel.gate(enabled, emit === undefined ? Logging.stderrLogger(run) : hostLogger(emit)),
  ] as const
}

const everyLevel = Layer.succeed(References.MinimumLogLevel, 'All')

function defaultRetention(): Retention {
  const parsed = parseRetention('7d')
  if (Result.isFailure(parsed)) throw observabilityErrors.LOG_RETENTION_INVALID({reason: parsed.failure})
  return parsed.success
}

export function layer(options: Options, emit?: LogWriter, retention?: Retention) {
  const app = {
    client: options.client ?? 'conciv',
    version: options.version ?? 'unknown',
    channel: options.channel ?? 'local',
    instance: options.instance,
  }
  const run = makeRunId()
  const level = options.level ?? 'off'
  const levels = LogLevel.layer({engine: level, widget: level}).pipe(
    Layer.merge(LogStore.layer(retention ?? defaultRetention())),
  )
  const local = Layer.unwrap(
    Effect.gen(function* () {
      const levels = yield* LogLevel.Service
      const store = yield* LogStore.Service
      return Logger.layer(sinks(run, app, emit, levels.enabled, store), {mergeWithExisting: false})
    }),
  ).pipe(Layer.merge(everyLevel))
  const exported = Layer.unwrap(
    Effect.gen(function* () {
      const levels = yield* LogLevel.Service
      const store = yield* LogStore.Service
      const made = [...sinks(run, app, emit, levels.enabled, store), ...Otlp.loggers(options, app, run, levels.enabled)]
      const logs = Logger.layer(made, {mergeWithExisting: false}).pipe(
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(OtlpExporter.layerFlusher),
        Layer.orDie,
        Layer.merge(everyLevel),
      )
      return Layer.merge(logs, yield* Otlp.tracingLayer(options, app, run))
    }),
  ).pipe(Layer.catchCause(() => local))
  return exported.pipe(Layer.provideMerge(levels))
}

export const tracer = Effect.serviceOption(OtelTracer.OtelTracer).pipe(Effect.map(Option.getOrUndefined))
