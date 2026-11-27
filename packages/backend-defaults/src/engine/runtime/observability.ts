import type {Tracer} from '../../ai.js'
import {Global} from '@conciv/backend-app-api'
import {Observability} from '../../backend-defaults.js'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {Cause, Config, ConfigProvider, Effect, Layer, ManagedRuntime, Option, type Context} from 'effect'
import corePackage from '../../../package.json' with {type: 'json'}
import {provideGlobalRoots} from './plugin-runtime.js'
import {layer as hostLogs, type LogOptions} from '../lib/logging.js'
import {initLoggerLayer, loggerLayer} from 'evlog/effect'

const OtlpExporterConfig = Config.all({
  endpoint: Config.option(Config.String('OTEL_EXPORTER_OTLP_ENDPOINT')),
  headers: Config.option(Config.String('OTEL_EXPORTER_OTLP_HEADERS')),
})

function provideObservability(configProvider: ConfigProvider.ConfigProvider, engineId: string) {
  return Layer.unwrap(
    OtlpExporterConfig.pipe(
      Effect.map(({endpoint, headers}) =>
        Observability.layer({
          endpoint: Option.getOrUndefined(endpoint),
          headers: Option.getOrUndefined(headers),
          version: corePackage.version,
          instance: engineId,
        }),
      ),
    ),
  ).pipe(Layer.provide(ConfigProvider.layer(configProvider)), Layer.orDie)
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
}

const RPC_EVENTS = {silent: true, redact: false, env: {service: 'conciv'}, _suppressDrainWarning: true}

function observabilityLayer(input: ObservabilityInput): Layer.Layer<Global.Interface> {
  return Layer.mergeAll(loggerLayer(), initLoggerLayer(RPC_EVENTS)).pipe(
    Layer.provideMerge(hostLogs(input.log)),
    Layer.provideMerge(provideObservability(input.configProvider, input.engineId)),
    Layer.provideMerge(machineRoots(input.home, input.fallbackRoots)),
  )
}

export type EngineObservability = {
  context: Context.Context<Global.Interface>
  tracer: Tracer | undefined
  dispose: () => Promise<void>
}

export async function startObservability(input: ObservabilityInput): Promise<EngineObservability> {
  const runtime = ManagedRuntime.make(observabilityLayer(input))
  const context = await runtime.context()
  const tracer = await runtime.runPromise(Observability.tracer)
  return {context, tracer, dispose: () => runtime.dispose()}
}
