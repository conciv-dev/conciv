import {Schema} from 'effect'
import {ephemeral, inventory} from './event.js'
import {optional} from './schema.js'

export const Id = Schema.String.pipe(Schema.brand('WebSearch.ID'), Schema.annotate({identifier: 'WebSearch.ID'}))
export type Id = typeof Id.Type

export interface Provider extends Schema.Schema.Type<typeof Provider> {}
export const Provider = Schema.Struct({
  id: Id,
  name: Schema.String,
}).annotate({identifier: 'WebSearch.Provider'})

export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({
  query: Schema.String,
  providerId: Id.pipe(optional),
}).annotate({identifier: 'WebSearch.Input'})
export type ProviderInput = Pick<Input, 'query'>

export interface Result extends Schema.Schema.Type<typeof Result> {}
export const Result = Schema.Struct({
  url: Schema.String,
  title: Schema.String.pipe(optional),
  content: Schema.String.pipe(optional),
  time: Schema.Struct({
    published: Schema.Finite.pipe(optional).annotate({
      description: 'Publication time in milliseconds since the Unix epoch',
    }),
  }),
}).annotate({identifier: 'WebSearch.Result'})

export interface Response extends Schema.Schema.Type<typeof Response> {}
export const Response = Schema.Struct({
  providerId: Id,
  results: Schema.Array(Result),
}).annotate({identifier: 'WebSearch.Response'})

const Updated = ephemeral({
  type: 'websearch.updated',
  schema: {},
})
export const Event = {Updated, Definitions: inventory(Updated)}
