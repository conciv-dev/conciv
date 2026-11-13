import type {SessionId} from '@conciv/protocol/chat-types'
import type {z} from 'zod'
import type * as Tool from '../schema/tool.js'
import type {Hooks, Transform} from './registration.js'

export type {CallId, Error, Metadata, Options, Result} from '../schema/tool.js'
export {isToolError, toolError} from '../schema/tool.js'

export interface ToolContext extends Omit<Tool.Context, 'progress'> {
  readonly signal: AbortSignal
  readonly progress: (update: Tool.Metadata) => Promise<void>
}

export type Info<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType | undefined = z.ZodType | undefined,
> = Omit<Tool.Info<Input, Output>, 'execute'> & {
  execute(input: Parameters<Tool.Info<Input, Output>['execute']>[0], context: ToolContext): Promise<Tool.Result<Output>>
}

type Mutable<Value> = {-readonly [Key in keyof Value]: Value[Key]}

export interface ToolEditor {
  list(): readonly (Info & {readonly id: string})[]
  get(id: string): (Info & {readonly id: string}) | undefined
  namespace(namespace: Tool.Namespace): void
  add<Input extends z.ZodType, Output extends z.ZodType | undefined>(tool: Info<Input, Output>): void
  update(id: string, update: (tool: Mutable<Info>) => void): void
  remove(id: string): void
}

interface ToolHooks {
  readonly 'execute.before': {
    tool: string
    readonly sessionId: SessionId
    readonly agent: string
    /** @remarks Not implemented yet. Always undefined in this version. */
    readonly messageId: string | undefined
    readonly id: Tool.CallId
    input: unknown
  }
  readonly 'execute.after': {
    readonly tool: string
    readonly sessionId: SessionId
    readonly agent: string
    /** @remarks Not implemented yet. Always undefined in this version. */
    readonly messageId: string | undefined
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

export interface ToolDomain {
  readonly transform: Transform<ToolEditor>
  readonly reload: () => Promise<void>
  readonly list: () => Promise<readonly (Info & {readonly id: string})[]>
  readonly hook: Hooks<ToolHooks>
}
