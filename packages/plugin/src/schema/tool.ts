export * as Tool from './tool.js'

import {Effect, JsonSchema, Schema} from 'effect'
import type {StandardSchemaV1} from '@standard-schema/spec'
import type {Agent} from './agent.js'
import type {Session} from './session.js'
import type {SessionMessage} from './session-message.js'

export type Metadata = Readonly<Record<string, unknown>>

export const CallId = Schema.String.pipe(Schema.brand('Tool.CallID'))
export type CallId = typeof CallId.Type

export interface Context {
  readonly sessionId: Session.Id
  readonly agent: Agent.Id
  readonly messageId: SessionMessage.Id | undefined
  readonly id: CallId
  readonly progress: (update: Metadata) => Effect.Effect<void>
  readonly cancel?: Effect.Effect<void>
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

export type ValueSchema<A = unknown> = Schema.Codec<A, unknown> | StandardSchemaV1<unknown, A> | JsonSchema.JsonSchema

type InputValue<S> =
  S extends Schema.Codec<infer A, unknown> ? A : S extends StandardSchemaV1<unknown, infer A> ? A : unknown
type OutputValue<S> = S extends undefined
  ? never
  : S extends Schema.Codec<infer A, unknown>
    ? A
    : S extends StandardSchemaV1<infer A, unknown>
      ? A
      : unknown

export const Error = Schema.TaggedStruct('Tool.Error', {
  message: Schema.String,
  error: Schema.optional(Schema.Defect()),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
export type Error = typeof Error.Type & globalThis.Error

export const makeError = (fields: Omit<typeof Error.Type, '_tag'>): Error =>
  Object.assign(new globalThis.Error(fields.message), Error.make(fields), {name: 'Tool.Error'})

export function toolError(input: Omit<typeof Error.Type, '_tag'>): Error {
  const fields: typeof Error.Type = {...input, _tag: 'Tool.Error'}
  return Object.assign(new globalThis.Error(input.message), fields, {name: 'Tool.Error'})
}

export const isToolError = Schema.is(Error)

export interface TextContent extends Schema.Schema.Type<typeof TextContent> {}
export const TextContent = Schema.Struct({
  type: Schema.Literal('text'),
  text: Schema.String,
}).annotate({identifier: 'Tool.TextContent'})

export interface FileContent extends Schema.Schema.Type<typeof FileContent> {}
export const FileContent = Schema.Struct({
  type: Schema.Literal('file'),
  uri: Schema.String,
  mime: Schema.String,
  name: Schema.optional(Schema.String),
}).annotate({identifier: 'Tool.FileContent'})

export const Content = Schema.Union([TextContent, FileContent])
  .pipe(Schema.toTaggedUnion('type'))
  .annotate({identifier: 'Tool.Content'})
export type Content = Schema.Schema.Type<typeof Content>

export interface Result<Output extends ValueSchema | undefined = ValueSchema | undefined> {
  readonly output?: OutputValue<Output>
  readonly content?: string | ReadonlyArray<Content>
  readonly metadata?: Metadata
}

export type Info<
  Input extends ValueSchema = ValueSchema,
  Output extends ValueSchema | undefined = ValueSchema | undefined,
> = {
  readonly name: string
  readonly input: Input
  readonly description: string
  execute(input: InputValue<Input>, context: Context): Effect.Effect<Result<Output>, Error>
  readonly output?: Output
  readonly options?: Options
}
