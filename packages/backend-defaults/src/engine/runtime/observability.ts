import type {Tracer} from '../../ai.js'
import {Global} from '@conciv/backend-app-api'
import {Observability} from '../../backend-defaults.js'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {Cause, Config, ConfigProvider, Effect, Layer, ManagedRuntime, Option, type Context} from 'effect'
import corePackage from '../../../package.json' with {type: 'json'}
import {provideGlobalRoots} from './plugin-runtime.js'
import {initLoggerLayer, loggerLayer} from 'evlog/effect'
import type {LogLevel, Retention} from '@conciv/types/config-types'
import type {LogOptions} from '../../util/observability/host-sink.js'
import type {Interface as LogLevelInterface} from '../../util/observability/log-level.js'
import type {Interface as LogStoreInterface} from '../../util/observability/log-store.js'

const OtlpExporterConfig = Config.all({
  endpoint: Config.option(Config.String('OTEL_EXPORTER_OTLP_ENDPOINT')),
  headers: Config.option(Config.String('OTEL_EXPORTER_OTLP_HEADERS')),
})

function provideObservability(input: ObservabilityInput) {
  return Layer.unwrap(
    OtlpExporterConfig.pipe(
      Effect.map(({endpoint, headers}) =>
        Observability.layer(
          {
            endpoint: Option.getOrUndefined(endpoint),
            headers: Option.getOrUndefined(headers),
            version: corePackage.version,
            instance: input.engineId,
            level: input.logLevel,
          },
          input.log?.emit,
          input.logRetention,
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
  logRetention?: Retention
}

const RPC_EVENTS = {silent: true, redact: false, env: {service: 'conciv'}, _suppressDrainWarning: true}

function observabilityLayer(input: ObservabilityInput) {
  return Layer.mergeAll(loggerLayer(), initLoggerLayer(RPC_EVENTS)).pipe(
    Layer.provideMerge(provideObservability(input)),
    Layer.provideMerge(machineRoots(input.home, input.fallbackRoots)),
  )
}

export type EngineObservability = {
  context: Context.Context<Global.Interface | LogLevelInterface | LogStoreInterface>
  tracer: Tracer | undefined
  dispose: () => Promise<void>
}

export async function startObservability(input: ObservabilityInput): Promise<EngineObservability> {
  const runtime = ManagedRuntime.make(observabilityLayer(input))
  const context = await runtime.context()
  const tracer = await runtime.runPromise(Observability.tracer)
  return {context, tracer, dispose: () => runtime.dispose()}
}
