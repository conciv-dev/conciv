import {test as base} from 'vitest'
import {makeBrowserRpcClient, type BrowserRpcClient, type RpcClient} from '@conciv/client'
import type {Engine} from '@conciv/plugin-testkit'

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
