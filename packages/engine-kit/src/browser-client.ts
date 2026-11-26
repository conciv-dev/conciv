import {makeBrowserEngineConnection, makeEngineRpcClient, type RpcClient} from '@conciv/client'

export type BrowserClient = {rpc: RpcClient; close: () => void}

export function browserClient(apiBase: string, options: {token?: string; session?: () => string} = {}): BrowserClient {
  const connection = makeBrowserEngineConnection(apiBase, {token: options.token})
  return {rpc: makeEngineRpcClient(() => connection, options.session), close: connection.dispose}
}
