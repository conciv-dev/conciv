import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import type {AnyRouter, RouterClient} from '@orpc/server'
import {dynamicBrowserRpcLink} from '@conciv/contract'

export type ExtRpcContext = ClientRetryPluginContext

function nodeFetchClient<TRouter extends AnyRouter>(
  apiBase: string,
  extensionSlug: string,
): RouterClient<TRouter, ExtRpcContext> {
  const link = new RPCLink<ExtRpcContext>({
    url: `${apiBase}/rpc/ext/${extensionSlug}`,
    plugins: [new ClientRetryPlugin<ExtRpcContext>()],
  })
  return createORPCClient(link)
}

export function makeExtRpcClient<TRouter extends AnyRouter>(
  apiBase: string,
  extensionSlug: string,
): RouterClient<TRouter, ExtRpcContext> {
  if (typeof location === 'undefined') return nodeFetchClient<TRouter>(apiBase, extensionSlug)
  return createORPCClient(
    dynamicBrowserRpcLink(() => apiBase),
    {path: ['ext', extensionSlug]},
  )
}
