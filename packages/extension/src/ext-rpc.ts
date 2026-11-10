import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import type {AnyRouter, RouterClient} from '@orpc/server'
import {abortableFetch, heldBrowserRpcLink, type SessionAccessor} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {CONCIV_VERSION_HEADER} from '@conciv/protocol/rpc-types'
import extensionManifest from '../package.json' with {type: 'json'}

export type ExtRpcContext = ClientRetryPluginContext

const requestHeaders = (session: SessionAccessor | undefined): Record<string, string> => {
  const id = session?.()
  return {...(id ? {[CONCIV_SESSION_HEADER]: id} : {}), [CONCIV_VERSION_HEADER]: extensionManifest.version}
}

function nodeFetchClient<TRouter extends AnyRouter>(
  apiBase: string,
  extensionSlug: string,
  session: SessionAccessor | undefined,
): RouterClient<TRouter, ExtRpcContext> {
  const link = new RPCLink<ExtRpcContext>({
    url: `${apiBase}/rpc/ext/${extensionSlug}`,
    fetch: abortableFetch,
    headers: () => requestHeaders(session),
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
  return createORPCClient(heldBrowserRpcLink(() => apiBase, session).link, {path: ['ext', extensionSlug]})
}
