import {Effect} from 'effect'
import {bind} from './fff.js'

export type {Directory, DirSearch, File, Init, Mixed, MixedSearch, Picker, Result, Search} from './fff.js'

export const adapter = Effect.promise(() =>
  import('@ff-labs/fff-node').then(
    ({FileFinder}) => bind(FileFinder, 'fff unavailable on node runtime'),
    () => bind(undefined, 'fff unavailable on node runtime'),
  ),
)
