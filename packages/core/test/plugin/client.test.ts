import {makeRpcClient} from '@conciv/contract'
import {createRoot} from 'solid-js'
import {createEngine} from '../engine.js'
import {describe, expect, it} from 'vitest'
import {Conciv, type ConcivEvent} from '@conciv/plugin'
import {createClientConnection} from '@conciv/plugin/experimental/host'

describe('the SDK client connection keeps its event stream open', () => {
  function connect(client: ReturnType<typeof Conciv.make>, idleTimeout?: number) {
    const arrivals: ((event: ConcivEvent) => void)[] = []
    const next = () => new Promise<ConcivEvent>((resolve) => arrivals.push(resolve))
    const root = createRoot((dispose) => ({
      dispose,
      connection: createClientConnection(client, {
        idleTimeout,
        flushInterval: 0,
        reconnect: () => Promise.resolve(client),
        onEvent: (event) => arrivals.shift()?.(event),
      }),
    }))
    return {...root, next}
  }

  it('the stream connects, comes back after the engine restarts, reopens when it goes silent, and is connecting again once stopped', async () => {
    const engine = await createEngine({}, {timeouts: {eventHeartbeatIntervalMs: 60_000}})
    const server = () => engine.address.apiBase
    const steady = connect(Conciv.make(makeRpcClient(engine.address.apiBase, {token: engine.address.token}), {server}))
    expect(steady.connection.status()).toBe('connecting')

    expect(await steady.next()).toMatchObject({type: 'server.connected'})
    expect(steady.connection.status()).toBe('connected')

    const restarted = steady.next()
    await engine.restart()
    expect(await restarted).toMatchObject({type: 'server.connected'})
    expect(steady.connection.status()).toBe('connected')
    expect(steady.connection.internal.history().map((item) => item.data.status)).toContain('disconnected')

    steady.dispose()
    expect(steady.connection.status()).toBe('connecting')

    const watched = connect(
      Conciv.make(makeRpcClient(engine.address.apiBase, {token: engine.address.token}), {server}),
      50,
    )
    expect(await watched.next()).toMatchObject({type: 'server.connected'})
    expect(await watched.next()).toMatchObject({type: 'server.connected'})
    expect(watched.connection.internal.history().map((item) => item.data.error)).toContain('Event stream stalled')
    expect(watched.connection.status()).toBe('connected')

    watched.dispose()
    expect(watched.connection.status()).toBe('connecting')
  })
})
