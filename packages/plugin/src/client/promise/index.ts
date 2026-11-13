import type {RpcClient} from '@conciv/contract'
import type {RpcApi} from './rpc.js'

export type {EventSubscribeOutput as ConcivEvent} from './generated/types.js'

export type ConcivClient = RpcClient & {
  readonly rpc: RpcApi
}
