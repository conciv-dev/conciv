import type {Rule, Ruleset} from './permission.js'
import type {Transform} from './registration.js'

export type Id = string

export type Name = string

export interface Info {
  readonly id: Id
  readonly name: Name
  readonly permissions: Ruleset
}

type MutableInfo = {
  -readonly [Key in keyof Info]: Key extends 'permissions'
    ? Array<{-readonly [Field in keyof Rule]: Rule[Field]}>
    : Info[Key]
}

export interface AgentEditor {
  list(): readonly MutableInfo[]
}

export interface AgentDomain {
  readonly transform: Transform<AgentEditor>
}
