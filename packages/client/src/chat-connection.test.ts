import {createServer} from 'node:net'
import {describe, expect, it} from 'vitest'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {ClientRetryPlugin} from '@orpc/client/plugins'
import {StreamReconnectLimitError} from '@conciv/ai/client'
import type {RpcClient, RpcClientContext} from '@conciv/contract'
import {chatConnection} from './chat-connection.js'

async function closedBase(): Promise<string> {
  const server = createServer()
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('no port'))
      resolve(address.port)
    })
  })
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

describe('chat run reconnect options', () => {
  it('gives a run up at the ceiling after the short attempts and delays it was given', async () => {
    const base = await closedBase()
    const counted = {calls: 0}
    const rpc: RpcClient = createORPCClient(
      new RPCLink<RpcClientContext>({
        url: `${base}/rpc`,
        clientInterceptors: [
          (options) => {
            counted.calls += 1
            return options.next()
          },
        ],
        plugins: [new ClientRetryPlugin<RpcClientContext>()],
      }),
    )
    const connection = chatConnection(rpc, base, 'conciv_run_reconnect', {
      runReconnect: {attempts: 2, firstDelayMs: 1, maxDelayMs: 2},
    })
    const reading = async () => {
      for await (const event of connection.joinRun('run_short')) expect(event).toBeUndefined()
    }
    const failure = await reading().catch((error: unknown) => error)
    connection.close()
    expect(failure).toBeInstanceOf(StreamReconnectLimitError)
    expect(counted.calls).toBe(3)
  })
})
