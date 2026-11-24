import {makeBrowserRpcClient, type BrowserRpcClient, type RpcClient} from '@conciv/contract'
import {test as base, type HarnessEngine as Engine} from '../../src/testing.js'

export const test = base.extend<{
  connect: (engine: Engine) => RpcClient
}>({
  connect: async ({task: _task}, use) => {
    const clients: BrowserRpcClient[] = []
    await use((engine) => {
      const client = makeBrowserRpcClient(engine.address.apiBase, {
        token: engine.address.token,
        session: () => engine.session.id,
      })
      clients.push(client)
      return client.rpc
    })
    for (const client of clients) client.close()
  },
})
