import {Effect} from 'effect'
import {bind} from './fff.js'

export type {Directory, DirSearch, File, Init, Mixed, MixedSearch, Picker, Result, Search} from './fff.js'

export const adapter = Effect.sync(() => bind(undefined, 'fff unavailable on workerd runtime'))
