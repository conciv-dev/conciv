import {createBackend, type BackendOptions, type Engine} from '@conciv/backend-defaults/backend'
import {builtins as pageEngineBuiltins} from '@conciv/plugin-page/engine-builtins'
import type {StartSimulation} from '@conciv/backend-defaults/backend'

export type {Engine, LogEntry, LogOptions, PortRequest} from '@conciv/backend-defaults/backend'

export type StartOpts = Omit<BackendOptions, 'simulation' | 'plugins'> & {simulation?: boolean}

const startSimulation: StartSimulation = async (app, configProvider) =>
  (await import('@conciv/simulation/backend')).startSimulation(app, configProvider)

export function start({simulation, ...opts}: StartOpts): Promise<Engine> {
  return createBackend({
    ...opts,
    plugins: [...pageEngineBuiltins],
    simulation: simulation === true ? startSimulation : undefined,
  })
}
