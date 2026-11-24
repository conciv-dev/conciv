import {createORPCClient} from '@orpc/client'
import {browserRpcConnection, type RpcClient} from '@conciv/contract'
import {describe, expect, onTestFinished} from 'vitest'
import {test as it} from '../engine.js'
import {Conciv} from '@conciv/plugin'

describe('the SDK client event stream over the engine socket', () => {
  it('connects, and after the engine restarts the same subscription gets the new server.connected', async ({
    createEngine,
  }) => {
    const engine = await createEngine()
    const {link, trust, release} = browserRpcConnection(engine.address.apiBase, async () => engine.address.token)
    onTestFinished(release)
    expect(await trust.requestTrust()).toBe(true)
    const client = Conciv.make(createORPCClient<RpcClient>(link), {server: () => engine.address.apiBase})
    const events = client.event.subscribe()[Symbol.asyncIterator]()
    onTestFinished(async () => {
      await events.return?.()
    })

    expect((await events.next()).value).toMatchObject({type: 'server.connected'})
    const back = events.next()
    await engine.restart()
    expect(await back).toMatchObject({done: false, value: {type: 'server.connected'}})
  })
})
