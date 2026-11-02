import {hubRoutedRpc, makeQueryUtils, type HubCall, type QueryUtils} from '@conciv/client'
import type {QueryClient} from '@tanstack/solid-query'
import {RPC_UNBOUND_MESSAGE, SessionsListOutputSchema, type RpcClient} from '@conciv/contract'
import {readSharedState} from '@conciv/extension/devframe-connection'
import type {HubConnection} from '../app/devframe-link.js'

const DEVFRAME_GROUPS: ReadonlySet<string> = new Set(['sessions'])

export type AppHub = {connection: HubConnection; connected: () => boolean}

export type AppData = {
  rpc: RpcClient
  utils: QueryUtils
  invalidateSessions: () => void
  readHubState: () => () => void
}

function hubCallOf(hub: AppHub): HubCall {
  return async (name, input) => {
    if (!hub.connected()) throw new Error(RPC_UNBOUND_MESSAGE)
    const client = await hub.connection.ready()
    await client.ensureTrusted()
    return client.scope('conciv').rpc.call(name, input)
  }
}

export function makeAppData(rpc: RpcClient, hub: AppHub | undefined, queryClient: QueryClient): AppData {
  const routed = hub ? hubRoutedRpc(rpc, hubCallOf(hub), DEVFRAME_GROUPS) : rpc
  const utils = makeQueryUtils(routed)
  const writeSessions = (value: unknown): void => {
    const parsed = SessionsListOutputSchema.safeParse(value)
    if (!parsed.success) {
      console.error('conciv: the hub published a session list that does not parse', parsed.error)
      return
    }
    queryClient.setQueryData(utils.sessions.list.queryKey(), parsed.data)
  }
  return {
    rpc: routed,
    utils,
    invalidateSessions: () => void queryClient.invalidateQueries({queryKey: utils.sessions.list.key()}),
    readHubState: () => (hub ? readSharedState<object>(hub.connection, 'conciv:sessions', writeSessions) : () => {}),
  }
}
