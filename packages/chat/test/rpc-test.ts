import {test as base, vi} from 'vitest'
import {makeBrowserRpcClient, type BrowserRpcClient, type RpcClient} from '@conciv/contract'
import type {Engine} from '@conciv/plugin-testkit'

export const test = base.extend<{
  connect: (engine: Engine) => RpcClient
  advanceTimers: (ms: number) => Promise<void>
}>({
  connect: async ({task: _task}, use) => {
    const clients: BrowserRpcClient[] = []
    await use((engine) => {
      const client = makeBrowserRpcClient(engine.address.apiBase, {session: () => engine.session.id})
      clients.push(client)
      return client.rpc
    })
    for (const client of clients) client.close()
  },
  advanceTimers: async ({task: _task}, use) => {
    vi.useFakeTimers()
    await use(async (ms) => {
      await vi.advanceTimersByTimeAsync(ms)
    })
    vi.useRealTimers()
  },
})
