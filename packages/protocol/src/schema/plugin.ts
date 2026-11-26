import {Schema} from 'effect'
import {ephemeral, inventory} from './event.js'
import {optional} from './schema.js'

export const Id = Schema.String.pipe(Schema.brand('Plugin.ID'), Schema.annotate({identifier: 'Plugin.ID'}))
export type Id = typeof Id.Type

export const Source = Schema.Union([
  Schema.Struct({type: Schema.Literal('builtin')}),
  Schema.Struct({
    type: Schema.Literal('package'),
    target: Schema.String,
    version: Schema.String.pipe(optional),
    outdated: Schema.Literal(true).pipe(optional),
    updating: Schema.Literal(true).pipe(optional),
  }),
  Schema.Struct({type: Schema.Literal('local'), path: Schema.String}),
  Schema.Struct({type: Schema.Literal('sdk')}),
]).annotate({identifier: 'Plugin.Source'})
export type Source = typeof Source.Type

export const Features = Schema.Struct({
  server: Schema.Literal(true).pipe(optional),
  rpc: Schema.Literal(true).pipe(optional),
  experimental: Schema.Literal(true).pipe(optional),
}).annotate({identifier: 'Plugin.Features'})
export type Features = typeof Features.Type

export const Chunk = Schema.Struct({file: Schema.String, code: Schema.String}).annotate({identifier: 'Plugin.Chunk'})

export const Options = Schema.Record(Schema.String, Schema.Json)

export interface ExperimentalBundle extends Schema.Schema.Type<typeof ExperimentalBundle> {}
export const ExperimentalBundle = Schema.Struct({
  file: Schema.String,
  code: Schema.String,
  revision: Schema.String,
  options: Options,
  chunks: Schema.Array(Chunk),
}).annotate({identifier: 'Plugin.ExperimentalBundle'})

export interface ExperimentalChunks extends Schema.Schema.Type<typeof ExperimentalChunks> {}
export const ExperimentalChunks = Schema.Struct({
  revision: Schema.String,
  chunks: Schema.Array(Chunk),
}).annotate({identifier: 'Plugin.ExperimentalChunks'})

export const ChunkNotFound = Schema.TaggedStruct('Plugin.ChunkNotFound', {file: Schema.String})
export type ChunkNotFound = typeof ChunkNotFound.Type

export const State = Schema.Union([
  Schema.Struct({status: Schema.Literal('active')}),
  Schema.Struct({status: Schema.Literal('failed'), error: Schema.String, ref: Schema.String.pipe(optional)}),
]).annotate({identifier: 'Plugin.State'})
export type State = typeof State.Type

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: Id.pipe(optional),
  source: Source,
  features: Features,
  state: State,
  options: Schema.Record(Schema.String, Schema.Unknown).pipe(optional),
}).annotate({identifier: 'Plugin.Info'})

const Updated = ephemeral({
  type: 'plugin.updated',
  schema: {},
})
export const Event = {Updated, Definitions: inventory(Updated)}
