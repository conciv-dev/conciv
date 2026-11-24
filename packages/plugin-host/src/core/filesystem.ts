export * as FileSystem from './filesystem.js'

import {Context, Effect, Layer, Schema} from 'effect'
import {Entry, FindInput} from '../schema/filesystem.js'
import * as FileSystemSearch from './filesystem/search.js'
import {makeLocationNode} from './effect/app-node.js'

export {Entry, Match, Submatch} from '../schema/filesystem.js'
export {FindInput}

export const Content = Schema.Struct({
  uri: Schema.String,
  name: Schema.String.pipe(Schema.optional),
  content: Schema.String,
  encoding: Schema.Literals(['utf8', 'base64']),
  mime: Schema.String,
}).annotate({identifier: 'FileSystem.Content'})
export type Content = typeof Content.Type

export interface Interface {
  readonly find: (input: FindInput) => Effect.Effect<Entry[]>
}

export const Service = Context.Service<Interface>('@conciv/FileSystem')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const search = yield* FileSystemSearch.Service
    return Service.of({
      find: search.find,
    })
  }),
)

export const node = makeLocationNode({service: Service, layer, deps: [FileSystemSearch.node]})
