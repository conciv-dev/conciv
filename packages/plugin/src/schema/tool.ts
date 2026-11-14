import type {StandardSchemaV1} from '@standard-schema/spec'
import {z} from 'zod'
import type {SessionId} from '@conciv/protocol/chat-types'

export type Metadata = Readonly<Record<string, unknown>>

export type CallId = string

export interface Context {
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

interface JsonSchema {
  [x: string]: unknown
}

export type ValueSchema<A = unknown> = StandardSchemaV1<any, A> | JsonSchema

type InputValue<S> = 0 extends 1 & S ? any : S extends StandardSchemaV1<any, infer A> ? A : unknown
type OutputValue<S> = S extends undefined ? never : S extends StandardSchemaV1<infer A, any> ? A : any

export type Error = {
  readonly _tag: 'Tool.Error'
  readonly message: string
  readonly error?: unknown
  readonly metadata?: Record<string, unknown> | undefined
}

const ErrorSchema = z
  .object({
    _tag: z.literal('Tool.Error'),
    message: z.string(),
    error: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .readonly() satisfies z.ZodType<Error>

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

export interface Result<Output extends ValueSchema | undefined = ValueSchema | undefined> {
  readonly output?: OutputValue<Output>
  readonly content?: string | readonly Content[]
  readonly metadata?: Metadata
}

export type Info<
  Input extends ValueSchema = ValueSchema,
  Output extends ValueSchema | undefined = ValueSchema | undefined,
> = {
  readonly name: string
  readonly input: Input
  readonly description: string
  execute(input: InputValue<Input>, context: Context): Promise<Result<Output>>
  readonly output?: Output
  readonly options?: Options
}

export function toolError(input: Omit<Error, '_tag'>): Error & globalThis.Error {
  const fields: Error = {...input, _tag: 'Tool.Error'}
  return Object.assign(new globalThis.Error(input.message), fields, {name: 'Tool.Error'})
}

export function isToolError(value: unknown): value is Error {
  return ErrorSchema.safeParse(value).success
}
