import type {Agent} from '../../schema/agent.js'
import type {Permission} from '../../schema/permission.js'
import type {Session} from '../../schema/session.js'

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
