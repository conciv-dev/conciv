import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import {Effect, Layer, Logger, Option, References, Schema} from 'effect'
import {FetchHttpClient} from 'effect/http'
import {OtlpExporter, OtlpSerialization} from 'effect/observability'
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
})
export type Options = typeof Options.Type

export function layer(options: Options) {
  const app = {
    client: options.client ?? 'conciv',
    version: options.version ?? 'unknown',
    channel: options.channel ?? 'local',
    instance: options.instance,
  }
  const run = makeRunId()
  const local = Logger.layer(Logging.loggers(run, app.channel === 'local', app.channel), {
    mergeWithExisting: false,
  }).pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.orDie,
    Layer.merge(Layer.succeed(References.MinimumLogLevel, Logging.minimumLogLevel())),
  )
  return Layer.unwrap(
    Effect.gen(function* () {
      const logs = Logger.layer(
        [...Logging.loggers(run, app.channel === 'local', app.channel), ...Otlp.loggers(options, app, run)],
        {mergeWithExisting: false},
      ).pipe(
        Layer.provide(NodeFileSystem.layer),
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(OtlpExporter.layerFlusher),
        Layer.orDie,
        Layer.merge(Layer.succeed(References.MinimumLogLevel, Logging.minimumLogLevel())),
      )
      return Layer.merge(logs, yield* Otlp.tracingLayer(options, app, run))
    }),
  ).pipe(Layer.catchCause(() => local))
}

export const tracer = Effect.serviceOption(OtelTracer.OtelTracer).pipe(Effect.map(Option.getOrUndefined))
