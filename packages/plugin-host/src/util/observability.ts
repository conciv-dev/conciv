import {Effect, Layer, Logger, Schema} from 'effect'
import {FetchHttpClient} from 'effect/http'
import {OtlpExporter, OtlpSerialization} from 'effect/observability'
import * as Otlp from './observability/otlp.js'

export const Options = Schema.Struct({
  endpoint: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.String),
  client: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  channel: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

export function layer(options: Options) {
  const app = {
    client: options.client ?? 'conciv',
    version: options.version ?? 'unknown',
    channel: options.channel ?? 'local',
  }
  return Layer.unwrap(
    Effect.gen(function* () {
      const logs = Logger.layer(Otlp.loggers(options, app), {mergeWithExisting: true}).pipe(
        Layer.provide(OtlpSerialization.layerJson),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(OtlpExporter.layerFlusher),
        Layer.orDie,
      )
      return Layer.merge(logs, yield* Otlp.tracingLayer(options, app))
    }),
  ).pipe(Layer.catchCause(() => Layer.empty))
}
