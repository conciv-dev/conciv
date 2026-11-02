import {hubRoutedRpc, makeQueryUtils, type HubCall, type QueryUtils} from '@conciv/client'
import type {QueryClient} from '@tanstack/solid-query'
import {RPC_UNBOUND_MESSAGE, SessionsListOutputSchema, type RpcClient} from '@conciv/contract'
import {readSharedState} from '@conciv/extension/devframe-connection'
import {concivError} from '@conciv/extension/devframe-function'
import type {HubConnection} from '../app/devframe-link.js'

const DEVFRAME_GROUPS: ReadonlySet<string> = new Set(['sessions'])

export type AppHub = {connection: () => HubConnection; connected: () => boolean}

export type AppData = {
  rpc: RpcClient
  utils: QueryUtils
  invalidateSessions: () => void
  readHubState: () => () => void
}

function unreachable(): Error {
  return concivError('DISCONNECTED', 'conciv could not reach the engine')
}

function attemptSettled(connection: HubConnection): Promise<void> {
  if (connection.status() === 'connected') return Promise.resolve()
  if (connection.status() === 'closed') return Promise.reject(unreachable())
  const settled = Promise.withResolvers<void>()
  const offStatus = connection.onStatus((status) => {
    if (status === 'connected') settled.resolve()
    if (status === 'disconnected' || status === 'closed') settled.reject(unreachable())
  })
  if (connection.status() === 'idle') connection.ready().catch(() => {})
  return settled.promise.finally(offStatus)
}

function hubCallOf(hub: AppHub): HubCall {
  return async (name, input) => {
    if (!hub.connected()) throw new Error(RPC_UNBOUND_MESSAGE)
    const connection = hub.connection()
    await attemptSettled(connection)
    const client = await connection.ready()
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
    readHubState: () => (hub ? readSharedState<object>(hub.connection(), 'conciv:sessions', writeSessions) : () => {}),
  }
}
