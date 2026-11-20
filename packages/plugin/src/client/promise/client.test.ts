import {createServer} from 'node:http'
import {describe, expect, it, onTestFinished, vi} from 'vitest'
import {makeRpcClient} from '@conciv/contract'
import {make} from './client.js'

function refusingServer() {
  const server = createServer((_request, response) => {
    response.statusCode = 503
    response.end()
  })
  const listening = Promise.withResolvers<string>()
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address === null || typeof address === 'string') return listening.reject(new Error('no port'))
    listening.resolve(`http://127.0.0.1:${address.port}`)
  })
  onTestFinished(() => {
    server.close()
  })
  return listening.promise
}

describe('plugin client reconnect delay', () => {
  it('subscribes again after the short reconnect delay it was given', async () => {
    const base = await refusingServer()
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const attempts = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const counted = {calls: 0}
    const raw = makeRpcClient(base, {
      interceptors: [
        (options) => {
          attempts[counted.calls]?.resolve()
          counted.calls += 1
          return options.next()
        },
      ],
    })
    const client = make(raw, {server: () => base, reconnectDelay: 20})
    const reconnecting = Promise.withResolvers<void>()
    client.connection.on((status) => {
      if (status === 'reconnecting') reconnecting.resolve()
    })
    const stop = new AbortController()
    onTestFinished(() => stop.abort())
    const stream = client.event.subscribe({signal: stop.signal})[Symbol.asyncIterator]()
    const ended = stream.next().catch(() => undefined)
    await attempts[0]?.promise
    await reconnecting.promise
    await vi.advanceTimersByTimeAsync(20)
    await attempts[1]?.promise
    expect(counted.calls).toBe(2)
    stop.abort()
    await ended
  })
})
