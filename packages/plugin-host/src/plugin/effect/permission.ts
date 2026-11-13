import type {Agent} from '../../schema/agent.js'
import type {Permission} from '../../schema/permission.js'
import type {Session} from '../../schema/session.js'
import type {Tool} from '../../schema/tool.js'
import type {Effect} from 'effect'
import type {AssertInput} from '../permission.js'
import type {Hooks} from './registration.js'

export interface PermissionEvaluation {
  readonly sessionId: Session.Id
  readonly agent?: Agent.Id
  readonly action: string
  readonly resources: ReadonlyArray<string>
  readonly metadata?: Record<string, unknown>
  readonly source?: Permission.Source
  effect: Permission.Effect
  message?: string
}

export interface PermissionHooks {
  readonly evaluate: PermissionEvaluation
}

export type PermissionDomain = {
  readonly list: (input: {readonly sessionId: Session.Id}) => Effect.Effect<ReadonlyArray<Permission.Request>, unknown>
  readonly get: (input: {
    readonly sessionId: Session.Id
    readonly requestId: Permission.Id
  }) => Effect.Effect<Permission.Request, unknown>
  readonly reply: (input: {
    readonly sessionId: Session.Id
    readonly requestId: Permission.Id
    readonly decision: Permission.Reply
    readonly message?: string | undefined
  }) => Effect.Effect<void, unknown>
} & {
  readonly hook: Hooks<PermissionHooks>
  readonly assert: (input: AssertInput) => Effect.Effect<void, Tool.Error>
}
