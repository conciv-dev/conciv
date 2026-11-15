import type {Agent} from '../../schema/agent.js'
import type {Types} from 'effect'
import type {Transform} from './registration.js'

export interface AgentEditor {
  list(): readonly Types.DeepMutable<Agent.Info>[]
  get(id: string): Types.DeepMutable<Agent.Info> | undefined
  default(id: string | undefined): void
  update(id: string, update: (agent: Types.DeepMutable<Agent.Info>) => void): void
  remove(id: string): void
}

export interface AgentDomain {
  readonly transform: Transform<AgentEditor>
}
