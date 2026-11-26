import type {ConfigProvider} from 'effect'
import type {App, Replacements} from '@conciv/simulation/backend'

export type SimulationParts = Pick<Replacements, 'httpClient' | 'plugins'>

export type Simulation = Replacements & {close: () => Promise<void>}

export type StartSimulation = (app: App, configProvider: ConfigProvider.ConfigProvider) => Promise<Simulation>
