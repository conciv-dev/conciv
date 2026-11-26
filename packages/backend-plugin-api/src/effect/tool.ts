import * as Tool from '@conciv/protocol/schema/tool'
import type * as Agent from '@conciv/protocol/schema/agent'
import type * as Session from '@conciv/protocol/schema/session'
import type * as SessionMessage from '@conciv/protocol/schema/session-message'
import type {Effect, Types} from 'effect'
import type {Hooks, Transform} from './registration.js'

export interface ToolEditor {
  list(): readonly (Tool.Info & {readonly id: string})[]
  get(id: string): (Tool.Info & {readonly id: string}) | undefined
  namespace(namespace: Tool.Namespace): void
  add<Input extends Tool.ValueSchema, Output extends Tool.ValueSchema | undefined>(tool: Tool.Info<Input, Output>): void
  update(id: string, update: (tool: Types.Mutable<Tool.Info>) => void): void
  remove(id: string): void
}

export interface ToolHooks {
  readonly 'execute.before': {
    tool: string
    readonly sessionId: Session.Id
    readonly agent: Agent.Id
    readonly messageId: SessionMessage.Id | undefined
    readonly id: Tool.CallId
    input: unknown
  }
  readonly 'execute.after': {
    readonly tool: string
    readonly sessionId: Session.Id
    readonly agent: Agent.Id
    readonly messageId: SessionMessage.Id | undefined
    readonly id: Tool.CallId
    readonly input: unknown
  } & (
    | {
        readonly status: 'completed'
        result: Tool.Result
      }
    | {
        readonly status: 'error'
        error: Tool.Error
      }
  )
}

export interface ToolFailures extends Record<keyof ToolHooks, unknown> {
  readonly 'execute.before': Tool.Error
  readonly 'execute.after': never
}

export interface ToolDomain {
  readonly transform: Transform<ToolEditor>
  readonly reload: () => Effect.Effect<void>
  readonly list: () => Effect.Effect<readonly (Tool.Info & {readonly id: string})[]>
  readonly hook: Hooks<ToolHooks, ToolFailures>
}
