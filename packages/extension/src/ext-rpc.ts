import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import type {AnyRouter, RouterClient} from '@orpc/server'
import {dynamicBrowserRpcLink, type SessionAccessor} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

export type ExtRpcContext = ClientRetryPluginContext

const sessionHeaders = (session: SessionAccessor | undefined): Record<string, string> => {
  const id = session?.()
  return id ? {[CONCIV_SESSION_HEADER]: id} : {}
}

function nodeFetchClient<TRouter extends AnyRouter>(
  apiBase: string,
  extensionSlug: string,
  session: SessionAccessor | undefined,
): RouterClient<TRouter, ExtRpcContext> {
  const link = new RPCLink<ExtRpcContext>({
    url: `${apiBase}/rpc/ext/${extensionSlug}`,
    headers: () => sessionHeaders(session),
    plugins: [new ClientRetryPlugin<ExtRpcContext>()],
  })
  return createORPCClient(link)
}

export function makeExtRpcClient<TRouter extends AnyRouter>(
  apiBase: string,
  extensionSlug: string,
  session?: SessionAccessor,
): RouterClient<TRouter, ExtRpcContext> {
  if (typeof location === 'undefined') return nodeFetchClient<TRouter>(apiBase, extensionSlug, session)
  return createORPCClient(
    dynamicBrowserRpcLink(() => apiBase, session),
    {path: ['ext', extensionSlug]},
  )
}
