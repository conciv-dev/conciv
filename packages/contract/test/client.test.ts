import {describe, expect, expectTypeOf, it} from 'vitest'
import type {SessionMeta} from '../src/rows.js'
import {makeBrowserRpcClient, makeRpcClient, type RpcClient} from '../src/client.js'

describe('makeRpcClient', () => {
  it('builds a typed client rooted at <apiBase>/rpc', async () => {
    const requests: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init).url)
      return new Response(JSON.stringify({json: []}), {headers: {'content-type': 'application/json'}})
    }
    try {
      const client = makeRpcClient('http://conciv.test')
      await client.sessions.list(undefined)
      expect(requests[0]).toContain('http://conciv.test/rpc/sessions/list')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('is typed by the contract', () => {
    expectTypeOf<Awaited<ReturnType<RpcClient['sessions']['list']>>>().toEqualTypeOf<SessionMeta[]>()
  })
})

describe('makeBrowserRpcClient', () => {
  it('is bound immediately when constructed with a plain base string', () => {
    const client = makeBrowserRpcClient('http://127.0.0.1:1')
    expect(client.bound()).toBe(true)
    client.close()
  })

  it('starts unbound when constructed with a null-returning accessor, and rejects calls with the current message until bound', async () => {
    const client = makeBrowserRpcClient(() => null)
    expect(client.bound()).toBe(false)
    await expect(client.rpc.sessions.resolve({})).rejects.toThrow('conciv core not connected yet')
    client.bind('http://127.0.0.1:1')
    expect(client.bound()).toBe(true)
    client.close()
  })

  it('throws on double bind', () => {
    const client = makeBrowserRpcClient(() => null)
    client.bind('http://127.0.0.1:1')
    expect(() => client.bind('http://127.0.0.1:2')).toThrow()
    client.close()
  })

  it('rejects an empty api base and keeps bound() false so a later bind is not silently swallowed', () => {
    const client = makeBrowserRpcClient(() => null)
    expect(() => client.bind('')).toThrow()
    expect(client.bound()).toBe(false)
    client.bind('http://127.0.0.1:1')
    expect(client.bound()).toBe(true)
    client.close()
  })

  it('rebind closes the previous connection and moves the client onto the new base', () => {
    const client = makeBrowserRpcClient('http://127.0.0.1:1')
    expect(client.bound()).toBe(true)
    client.rebind('http://127.0.0.1:2')
    expect(client.bound()).toBe(true)
    client.close()
  })

  it('rejects calls after close instead of resurrecting the connection', async () => {
    const client = makeBrowserRpcClient('http://127.0.0.1:1')
    client.close()
    expect(client.bound()).toBe(false)
    await expect(client.rpc.sessions.resolve({})).rejects.toThrow('conciv core not connected yet')
  })

  it('close is idempotent: calling it twice does not throw', () => {
    const client = makeBrowserRpcClient('http://127.0.0.1:1')
    client.close()
    expect(() => client.close()).not.toThrow()
  })

  it('re-reads a caller-supplied base accessor on every call instead of freezing it at construction', () => {
    let currentBase: string | null = 'http://127.0.0.1:1'
    const client = makeBrowserRpcClient(() => currentBase)
    expect(client.bound()).toBe(true)
    currentBase = 'http://127.0.0.1:2'
    expect(client.bound()).toBe(true)
    currentBase = null
    expect(client.bound()).toBe(false)
    client.close()
  })

  it('targets the base returned by the accessor at call time, not the base seen at construction', async () => {
    const requests: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init).url)
      return new Response(JSON.stringify({json: []}), {headers: {'content-type': 'application/json'}})
    }
    let currentBase = 'http://client-accessor-one.test'
    const client = makeBrowserRpcClient(() => currentBase, {transport: 'fetch'})
    try {
      await client.rpc.sessions.list(undefined)
      expect(requests[0]).toContain('client-accessor-one.test')
      currentBase = 'http://client-accessor-two.test'
      await client.rpc.sessions.list(undefined)
      expect(requests[1]).toContain('client-accessor-two.test')
    } finally {
      globalThis.fetch = originalFetch
      client.close()
    }
  })
})
