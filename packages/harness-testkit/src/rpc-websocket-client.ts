import {createORPCClient, type NestedClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'

export function rpcOverWebsocket<TClient extends NestedClient<Record<never, never>>>(
  websocket: WebSocket,
  opts: {path?: readonly string[]} = {},
): TClient {
  const link = new RPCLink({websocket})
  return opts.path ? createORPCClient<TClient>(link, {path: [...opts.path]}) : createORPCClient<TClient>(link)
}
