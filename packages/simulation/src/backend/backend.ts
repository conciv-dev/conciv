import {Config, Effect, type FileSystem, type Layer, type Scope} from 'effect'
import type {HttpClient} from 'effect/http'
import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import type {HarnessAdapter} from '@conciv/harness'
import * as DriveManifest from '../manifest.js'
import * as SimulationNetwork from './network.js'
import {ENGINE_HARNESS, scriptedHarness} from './scripted-harness.js'
import {refusedHarness, simulatedHarness} from './simulated-harness.js'
import * as SimulatedProvider from './simulated-provider.js'

const UNDRIVEN = 'the simulation has no driver: CONCIV_DRIVE is not set, so every model call is refused'

export type App = {
  readonly version: string
  readonly directory: string
  readonly harness?: HarnessAdapter
  readonly harnesses?: readonly HarnessAdapter[]
}

export type Replacements = {
  readonly harness: HarnessAdapter
  readonly harnesses: readonly HarnessAdapter[] | undefined
  readonly httpClient: Layer.Layer<HttpClient.HttpClient>
  readonly plugins: readonly Plugin[]
}

function replaced(
  app: App,
  answer: (harness: HarnessAdapter) => HarnessAdapter,
  plugins: readonly Plugin[],
): Replacements {
  return {
    harness: answer(app.harness ?? scriptedHarness(ENGINE_HARNESS, app.directory)),
    harnesses: app.harnesses?.map(answer),
    httpClient: SimulationNetwork.layer([]),
    plugins,
  }
}

export const simulationReplacements: (
  app: App,
) => Effect.Effect<Replacements, Error, FileSystem.FileSystem | Scope.Scope> = Effect.fn('Simulation.replacements')(
  function* (app: App) {
    const drive = yield* Config.String('CONCIV_DRIVE').pipe(Config.withDefault(undefined))
    if (!drive) return replaced(app, refusedHarness(UNDRIVEN), [])
    const manifest = yield* DriveManifest.resolve()
    const driven = yield* SimulatedProvider.drive({endpoint: manifest.endpoints.backend, version: app.version})
    return replaced(app, simulatedHarness(driven.provider), [driven.plugin])
  },
)
