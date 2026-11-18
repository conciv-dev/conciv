import {bind} from './fff.js'

export type {Directory, DirSearch, File, Init, Mixed, MixedSearch, Picker, Result, Search} from './fff.js'

const adapter = bind(undefined, 'fff unavailable on workerd runtime')

export const available = adapter.available
export const create = adapter.create
