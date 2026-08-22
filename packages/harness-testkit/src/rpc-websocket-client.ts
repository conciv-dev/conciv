import {createORPCClient, type NestedClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

const links = new WeakMap<WebSocket, Map<string, RPCLink<Record<never, never>>>>()

function headersFor(session: string): Record<string, string> {
  return session === '' ? {} : {[CONCIV_SESSION_HEADER]: session}
}

function linkFor(websocket: WebSocket, session: string): RPCLink<Record<never, never>> {
  const bySession = links.get(websocket) ?? new Map<string, RPCLink<Record<never, never>>>()
  links.set(websocket, bySession)
  const known = bySession.get(session)
  if (known) return known
  const link = new RPCLink({websocket, headers: () => headersFor(session)})
  bySession.set(session, link)
  return link
}

export function rpcOverWebsocket<TClient extends NestedClient<Record<never, never>>>(
  websocket: WebSocket,
  options: {path?: readonly string[]; session?: string} = {},
): TClient {
  const link = linkFor(websocket, options.session ?? '')
  return options.path ? createORPCClient<TClient>(link, {path: [...options.path]}) : createORPCClient<TClient>(link)
}
