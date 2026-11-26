import type * as Agent from '@conciv/protocol/schema/agent'
import type {Rule} from '@conciv/protocol/schema/permission'
import type {Transform} from './registration.js'

type MutableInfo = {
  -readonly [Key in keyof Agent.Info]: Key extends 'permissions'
    ? Array<{-readonly [Field in keyof Rule]: Rule[Field]}>
    : Agent.Info[Key]
}

export interface AgentEditor {
  list(): readonly MutableInfo[]
}

export interface AgentDomain {
  readonly transform: Transform<AgentEditor>
}
