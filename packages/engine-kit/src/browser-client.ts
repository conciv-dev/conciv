import {makeBrowserEngineConnection, makeEngineRpcClient, type ContractClient} from '@conciv/client'

export type BrowserClient = {rpc: ContractClient; close: () => void}

export function browserClient(apiBase: string, options: {token?: string; session?: () => string} = {}): BrowserClient {
  const connection = makeBrowserEngineConnection(apiBase, {token: options.token})
  return {rpc: makeEngineRpcClient(() => connection, options.session), close: connection.dispose}
}
