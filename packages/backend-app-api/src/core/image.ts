import {Context, Schema, type Effect} from 'effect'
import type * as State from './state.js'
import type {EvlogError} from 'evlog'

export const Content = Schema.Struct({
  uri: Schema.String,
  name: Schema.String.pipe(Schema.optional),
  content: Schema.String,
  encoding: Schema.Literals(['utf8', 'base64']),
  mime: Schema.String,
}).annotate({identifier: 'FileSystem.Content'})
export type Content = typeof Content.Type

export type Limits = {
  autoResize: boolean
  maxWidth: number
  maxHeight: number
  maxBase64Bytes: number
}

export type Editor = {
  configure: (limits: Partial<Limits>) => void
}

export interface Interface extends State.Transformable<Editor> {
  readonly normalize: (
    resource: string,
    content: Content & {readonly encoding: 'base64'},
  ) => Effect.Effect<Content & {readonly encoding: 'base64'}, EvlogError>
}

export const Service = Context.Service<Interface>('@conciv/Image')
