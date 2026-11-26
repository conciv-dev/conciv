import type * as Conciv from './client.js'

export * as Conciv from './client.js'
export type {ClientConnectionOptions, ClientConnectionStatus} from './client.js'
export type {EventSubscribeOutput as ConcivEvent} from './generated/types.js'

export type ConcivClient = ReturnType<typeof Conciv.make>
