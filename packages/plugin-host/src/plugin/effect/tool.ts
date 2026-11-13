import {Tool} from '../../schema/tool.js'
import type {Agent} from '../../schema/agent.js'
import type {Session} from '../../schema/session.js'
import type {SessionMessage} from '../../schema/session-message.js'
import type {Effect, Types} from 'effect'
import type {Hooks, Transform} from './registration.js'

export interface ToolEditor {
  list(): readonly (Tool.Info & {readonly id: string})[]
  get(id: string): (Tool.Info & {readonly id: string}) | undefined
  namespace(namespace: Tool.Namespace): void
  add<Input extends Tool.ValueSchema<any>, Output extends Tool.ValueSchema<any> | undefined>(
    tool: Tool.Info<Input, Output>,
  ): void
  update(id: string, update: (tool: Types.Mutable<Tool.Info>) => void): void
  remove(id: string): void
}

export interface ToolHooks {
  readonly 'execute.before': {
    tool: string
    readonly sessionId: Session.Id
    readonly agent: Agent.Id
    readonly messageId: SessionMessage.Id
    readonly id: Tool.CallId
    input: unknown
  }
  readonly 'execute.after': {
    readonly tool: string
    readonly sessionId: Session.Id
    readonly agent: Agent.Id
    readonly messageId: SessionMessage.Id
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
