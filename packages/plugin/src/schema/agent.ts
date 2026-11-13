import type {Ruleset} from './permission.js'

export type Id = string

export type Name = string

export interface Info {
  readonly id: Id
  readonly name: Name
  readonly permissions: Ruleset
}
