import type {Tracer} from '../../ai.js'
import {Global} from '@conciv/backend-app-api'
import {Observability} from '../../backend-defaults.js'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {Cause, Config, ConfigProvider, Effect, Layer, ManagedRuntime, Option, type Context} from 'effect'
import corePackage from '../../../package.json' with {type: 'json'}
import {provideGlobalRoots} from './plugin-runtime.js'
import {readLogLevel, type LogLevel} from '@conciv/types/config-types'
import type {LogOptions} from '../../util/observability/host-sink.js'
import type {Interface as LogLevelInterface} from '../../util/observability/log-level.js'

const OtlpExporterConfig = Config.all({
  endpoint: Config.option(Config.String('OTEL_EXPORTER_OTLP_ENDPOINT')),
  headers: Config.option(Config.String('OTEL_EXPORTER_OTLP_HEADERS')),
  level: Config.option(Config.String('CONCIV_LOG_LEVEL')),
})

function provideObservability(input: ObservabilityInput) {
  return Layer.unwrap(
    OtlpExporterConfig.pipe(
      Effect.map(({endpoint, headers, level}) =>
        Observability.layer(
          {
            endpoint: Option.getOrUndefined(endpoint),
            headers: Option.getOrUndefined(headers),
            version: corePackage.version,
            instance: input.engineId,
            level: readLogLevel({env: Option.getOrUndefined(level), config: input.logLevel}),
          },
          input.log?.emit,
        ),
      ),
    ),
  ).pipe(Layer.provide(ConfigProvider.layer(input.configProvider)), Layer.orDie)
}

function machineRoots(home: string, fallback: string) {
  return provideGlobalRoots(home).pipe(
    Layer.catchCause((cause) =>
      Layer.unwrap(
        Effect.logError("[core] the plugin host's folders could not be made, using the fallback folder").pipe(
          Effect.annotateLogs({home, fallback, cause: Cause.pretty(cause)}),
          Effect.as(provideGlobalRoots(fallback)),
        ),
      ),
    ),
    Layer.provide(NodeFileSystem.layer),
  )
}

export type ObservabilityInput = {
  home: string
  fallbackRoots: string
  configProvider: ConfigProvider.ConfigProvider
  engineId: string
  log?: LogOptions
  logLevel?: LogLevel
}

function observabilityLayer(input: ObservabilityInput) {
  return provideObservability(input).pipe(Layer.provideMerge(machineRoots(input.home, input.fallbackRoots)))
}

export type EngineObservability = {
  context: Context.Context<Global.Interface | LogLevelInterface>
  tracer: Tracer | undefined
  dispose: () => Promise<void>
}

export async function startObservability(input: ObservabilityInput): Promise<EngineObservability> {
  const runtime = ManagedRuntime.make(observabilityLayer(input))
  const context = await runtime.context()
  const tracer = await runtime.runPromise(Observability.tracer)
  return {context, tracer, dispose: () => runtime.dispose()}
}
