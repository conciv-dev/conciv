import {z} from 'zod'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {Hooks, Transform} from './registration.js'

export type Metadata = Readonly<Record<string, unknown>>

export type CallId = string

export interface ToolContext {
  readonly sessionId: SessionId
  readonly agent: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly messageId: string | undefined
  readonly id: CallId
  readonly signal: AbortSignal
  readonly progress: (update: Metadata) => Promise<void>
}

export interface Namespace {
  readonly name: string
  readonly description: string
}

interface BaseOptions {
  readonly namespace?: string
  readonly permission?: string
}

export type Options = BaseOptions &
  (
    | {
        readonly codemode?: true
        readonly pinned?: boolean
      }
    | {
        readonly codemode: boolean
        readonly pinned?: never
      }
  )

type InputValue<Schema> = Schema extends z.ZodType ? z.output<Schema> : unknown
type OutputValue<Schema> = Schema extends undefined ? never : Schema extends z.ZodType ? z.input<Schema> : unknown

const ErrorSchema = z
  .object({
    _tag: z.literal('Tool.Error'),
    message: z.string(),
    error: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .readonly()

export type Error = z.infer<typeof ErrorSchema>

export interface TextContent {
  readonly type: 'text'
  readonly text: string
}

export interface FileContent {
  readonly type: 'file'
  readonly uri: string
  readonly mime: string
  readonly name?: string
}

export type Content = TextContent | FileContent

export interface Result<Output extends z.ZodType | undefined = z.ZodType | undefined> {
  readonly output?: OutputValue<Output>
  readonly content?: string | readonly Content[]
  readonly metadata?: Metadata
}

export type Info<Input extends z.ZodType = z.ZodType, Output extends z.ZodType | undefined = z.ZodType | undefined> = {
  readonly name: string
  readonly input: Input
  readonly description: string
  execute(input: InputValue<Input>, context: ToolContext): Promise<Result<Output>>
  readonly output?: Output
  readonly options?: Options
}

type Mutable<Value> = {-readonly [Key in keyof Value]: Value[Key]}

export interface ToolEditor {
  list(): readonly (Info & {readonly id: string})[]
  get(id: string): (Info & {readonly id: string}) | undefined
  namespace(namespace: Namespace): void
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
    readonly id: CallId
    input: unknown
  }
  readonly 'execute.after': {
    readonly tool: string
    readonly sessionId: SessionId
    readonly agent: string
    /** @remarks Not implemented yet. Always undefined in this version. */
    readonly messageId: string | undefined
    readonly id: CallId
    readonly input: unknown
  } & (
    | {
        readonly status: 'completed'
        result: Result
      }
    | {
        readonly status: 'error'
        error: Error
      }
  )
}

export interface ToolDomain {
  readonly transform: Transform<ToolEditor>
  readonly reload: () => Promise<void>
  readonly list: () => Promise<readonly (Info & {readonly id: string})[]>
  readonly hook: Hooks<ToolHooks>
}

export function toolError(input: Omit<Error, '_tag'>): Error {
  return {...input, _tag: 'Tool.Error'}
}

export function isToolError(value: unknown): value is Error {
  return ErrorSchema.safeParse(value).success
}
