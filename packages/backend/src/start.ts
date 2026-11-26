import {createBackend, type BackendOptions, type Engine} from '@conciv/backend-defaults/backend'
import page from '@conciv/plugin-page'
import {startSimulation} from './lib/simulation.js'

export type {Engine, LogEntry, LogOptions, PortRequest} from '@conciv/backend-defaults/backend'

export type StartOpts = Omit<BackendOptions, 'simulation' | 'plugins'> & {simulation?: boolean}

export function start({simulation, ...opts}: StartOpts): Promise<Engine> {
  return createBackend({...opts, plugins: [page], simulation: simulation === true ? startSimulation : undefined})
}
