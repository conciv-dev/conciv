import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import {Effect, Layer, Logger, Option, References, Schema} from 'effect'
import {FetchHttpClient} from 'effect/http'
import {OtlpExporter, OtlpSerialization} from 'effect/observability'
import {LogLevelSchema} from '@conciv/types/config-types'
import {hostLogger, type LogWriter} from './observability/host-sink.js'
import * as LogLevel from './observability/log-level.js'
import * as Logging from './observability/logging.js'
import * as Otlp from './observability/otlp.js'
import {makeRunId} from './observability/shared.js'

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

function sinks(run: string, app: {channel: string}, emit: LogWriter | undefined, enabled: LogLevel.Enabled) {
  const local = app.channel === 'local'
  return [
    Logging.gatedFileLogger(run, local, app.channel, enabled),
    LogLevel.gate(enabled, emit === undefined ? Logging.stderrLogger(run) : hostLogger(emit)),
  ] as const
}

const everyLevel = Layer.succeed(References.MinimumLogLevel, 'All')

export function layer(options: Options, emit?: LogWriter) {
  const app = {
    client: options.client ?? 'conciv',
    version: options.version ?? 'unknown',
    channel: options.channel ?? 'local',
    instance: options.instance,
  }
  const run = makeRunId()
  const level = options.level ?? 'off'
  const levels = LogLevel.layer({engine: level, widget: level})
  const local = Layer.unwrap(
    Effect.gen(function* () {
      const levels = yield* LogLevel.Service
      return Logger.layer(sinks(run, app, emit, levels.enabled), {mergeWithExisting: false})
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer), Layer.orDie, Layer.merge(everyLevel))
  const exported = Layer.unwrap(
    Effect.gen(function* () {
      const levels = yield* LogLevel.Service
      const made = [...sinks(run, app, emit, levels.enabled), ...Otlp.loggers(options, app, run, levels.enabled)]
      const logs = Logger.layer(made, {mergeWithExisting: false}).pipe(
        Layer.provide(NodeFileSystem.layer),
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
