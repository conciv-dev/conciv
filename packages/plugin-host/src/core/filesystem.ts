export * as FileSystem from './filesystem.js'

import {Schema} from 'effect'

export const Content = Schema.Struct({
  uri: Schema.String,
  name: Schema.String.pipe(Schema.optional),
  content: Schema.String,
  encoding: Schema.Literals(['utf8', 'base64']),
  mime: Schema.String,
}).annotate({identifier: 'FileSystem.Content'})
export type Content = typeof Content.Type
