import {createORPCClient, type NestedClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'

const links = new WeakMap<WebSocket, RPCLink<Record<never, never>>>()

function linkFor(websocket: WebSocket): RPCLink<Record<never, never>> {
  const known = links.get(websocket)
  if (known) return known
  const link = new RPCLink({websocket})
  links.set(websocket, link)
  return link
}

export function rpcOverWebsocket<TClient extends NestedClient<Record<never, never>>>(
  websocket: WebSocket,
  options: {path?: readonly string[]} = {},
): TClient {
  const link = linkFor(websocket)
  return options.path ? createORPCClient<TClient>(link, {path: [...options.path]}) : createORPCClient<TClient>(link)
}
