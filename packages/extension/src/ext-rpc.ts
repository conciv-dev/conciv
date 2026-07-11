import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import type {AnyRouter, RouterClient} from '@orpc/server'

export type ExtRpcContext = ClientRetryPluginContext

export type ExtRpcClientOpts = {
  onRetry?: (attempt: number) => void | ((success: boolean) => void)
}

export function makeExtRpcClient<TRouter extends AnyRouter>(
  apiBase: string,
  extensionSlug: string,
  opts: ExtRpcClientOpts = {},
): RouterClient<TRouter, ExtRpcContext> {
  const path = `${apiBase}/rpc/ext/${extensionSlug}`
  const link = new RPCLink<ExtRpcContext>({
    url: typeof location === 'undefined' ? path : new URL(path, location.href).toString(),
    plugins: [
      new ClientRetryPlugin({
        default: {
          onRetry: (options) => opts.onRetry?.(options.attemptIndex),
        },
      }),
    ],
  })
  return createORPCClient(link)
}
