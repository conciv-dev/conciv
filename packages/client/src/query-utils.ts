import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import type {RpcClient} from '@conciv/contract'

export function makeQueryUtils(client: RpcClient) {
  return createTanstackQueryUtils(client)
}

export type QueryUtils = ReturnType<typeof makeQueryUtils>
