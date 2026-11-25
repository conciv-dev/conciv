import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {ConfigProvider, Effect, Exit, Layer, Scope} from 'effect'
import type {App, Replacements} from '@conciv/simulation/backend'

export type SimulationParts = Pick<Replacements, 'httpClient' | 'plugins'>

export type Simulation = Replacements & {close: () => Promise<void>}

export async function startSimulation(app: App, configProvider: ConfigProvider.ConfigProvider): Promise<Simulation> {
  const {simulationReplacements} = await import('@conciv/simulation/backend')
  const scope = Effect.runSync(Scope.make())
  const close = (): Promise<void> => Effect.runPromise(Scope.close(scope, Exit.void))
  const services = Layer.mergeAll(NodeFileSystem.layer, ConfigProvider.layer(configProvider))
  const replacements = await Effect.runPromise(
    simulationReplacements(app).pipe(Scope.provide(scope), Effect.provide(services)),
  ).catch(async (error: unknown) => {
    await close()
    throw error
  })
  return {...replacements, close}
}
