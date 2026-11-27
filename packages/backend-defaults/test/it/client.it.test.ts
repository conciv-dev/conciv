import {Conciv, makeBrowserEngineConnection, makeEngineRpcClient, type ClientConnectionStatus} from '@conciv/client'
import {describe, expect} from 'vitest'
import {test as it} from '../utils/engine-test.js'

describe('the SDK client keeps its event stream open over the engine socket', () => {
  it('the stream connects, comes back after the engine restarts, reopens when it goes silent, and is connecting again once the last reader leaves', async ({
    createEngine,
  }) => {
    const engine = await createEngine({}, {timeouts: {eventHeartbeatIntervalMs: 60_000}})
    const steadyConnection = makeBrowserEngineConnection(engine.address.apiBase, {token: engine.address.token})
    const watchedConnection = makeBrowserEngineConnection(engine.address.apiBase, {
      token: engine.address.token,
      timings: {idleTimeoutMs: 50},
    })
    const server = () => engine.address.apiBase
    const steady = Conciv.make(
      makeEngineRpcClient(() => steadyConnection),
      {server},
    )
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

    const watched = Conciv.make(
      makeEngineRpcClient(() => watchedConnection),
      {server},
    )
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

    const browserConnection = makeBrowserEngineConnection(engine.address.apiBase)
    const trustSeen: string[] = []
    const revoked = new Promise<void>((resolve) => {
      browserConnection.trust.subscribe((status) => {
        trustSeen.push(status)
        if (status === 'revoked') resolve()
      })
    })
    expect(await browserConnection.trust.requestTrustWithCode(await engine.loginCode())).toEqual({
      token: expect.any(String),
    })
    const browser = Conciv.make(
      makeEngineRpcClient(() => browserConnection),
      {server},
    )
    const browserReading = new AbortController()
    const browserStream = browser.event.subscribe({types: ['permission.asked'], signal: browserReading.signal})
    const browserEvents = browserStream[Symbol.asyncIterator]()
    expect((await browserEvents.next()).value).toMatchObject({type: 'server.connected'})
    await engine.revokeBrowsers()
    await revoked
    expect(await browserConnection.trust.requestTrustWithCode(await engine.loginCode())).toEqual({
      token: expect.any(String),
    })
    expect(trustSeen.filter((status) => status === 'revoked')).toEqual(['revoked'])

    browserReading.abort()
    steadyConnection.dispose()
    watchedConnection.dispose()
    browserConnection.dispose()
  })
})
