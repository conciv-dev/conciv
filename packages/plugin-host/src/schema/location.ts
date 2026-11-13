export * as Location from './location.js'

import {Schema} from 'effect'
import {AbsolutePath} from './schema.js'

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  directory: AbsolutePath,
}).annotate({identifier: 'Location.Info'})
