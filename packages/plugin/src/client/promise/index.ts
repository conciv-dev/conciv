import type {Conciv} from './client.js'

export {Conciv} from './client.js'
export type {EventSubscribeOutput as ConcivEvent} from './generated/types.js'

export type ConcivClient = ReturnType<typeof Conciv.make>
