import {makeRpcClient} from '@conciv/contract'
import {createEngine} from '@conciv/plugin-testkit'
import {describe, expect, it} from 'vitest'
import {make, type ClientConnectionStatus} from './client.js'

describe('the SDK client keeps its event stream open', () => {
  it('the stream connects, comes back after the engine restarts, reopens when it goes silent, and is connecting again once the last reader leaves', async () => {
    const engine = await createEngine({}, {timeouts: {eventHeartbeatIntervalMs: 60_000}})
    const server = () => engine.address.apiBase
    const steady = make(makeRpcClient(engine.address.apiBase), {server, reconnectDelay: 0})
    const steadyReading = new AbortController()
    const steadyStream = steady.event.subscribe({types: ['permission.asked'], signal: steadyReading.signal})
    const steadyEvents = steadyStream[Symbol.asyncIterator]()
    expect(steady.connection.status()).toBe('connecting')

    expect((await steadyEvents.next()).value).toMatchObject({type: 'server.connected'})
    expect(steady.connection.status()).toBe('connected')

    const dropped = new Promise<ClientConnectionStatus>((resolve) => {
      const off = steady.connection.on((status) => {
        off()
        resolve(status)
      })
    })
    await engine.restart()
    expect(await dropped).toBe('reconnecting')
    expect((await steadyEvents.next()).value).toMatchObject({type: 'server.connected'})
    expect(steady.connection.status()).toBe('connected')

    steadyReading.abort()
    expect(steady.connection.status()).toBe('connecting')

    const watched = make(makeRpcClient(engine.address.apiBase), {server, idleTimeout: 50, reconnectDelay: 0})
    const watchedReading = new AbortController()
    const watchedStream = watched.event.subscribe({types: ['permission.asked'], signal: watchedReading.signal})
    const watchedEvents = watchedStream[Symbol.asyncIterator]()
    expect((await watchedEvents.next()).value).toMatchObject({type: 'server.connected'})

    const stalled = new Promise<ClientConnectionStatus>((resolve) => {
      const off = watched.connection.on((status) => {
        off()
        resolve(status)
      })
    })
    expect(await stalled).toBe('reconnecting')
    expect((await watchedEvents.next()).value).toMatchObject({type: 'server.connected'})
    expect(watched.connection.status()).toBe('connected')

    watchedReading.abort()
    expect(watched.connection.status()).toBe('connecting')
  })
})
