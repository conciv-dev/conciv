import {describe, expect, expectTypeOf, it, afterAll, beforeAll, vi} from 'vitest'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from '../src/rows.js'
import type {SessionMeta} from '../src/rows.js'
import {makeBrowserRpcClient, makeRpcClient, type RpcClient} from '../src/client.js'
import {createServer, type Server} from 'node:http'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {
  closeBrowserRpcConnection,
  dynamicBrowserRpcLink,
  resetBrowserRpcConnection,
  subscribeRpcReachability,
} from '../src/browser-transport.js'

describe('client', () => {
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
})

describe('rows', () => {
  describe('row schemas', () => {
    it('parses a session meta', () => {
      const parsed = SessionMetaSchema.parse({
        id: 'conciv_1',
        title: 'hello',
        updatedAt: 1,
        messageCount: 0,
        running: false,
        origin: 'conciv',
        usage: null,
        model: null,
        effort: null,
        hidden: false,
        native: null,
      })
      expect(parsed.hidden).toBe(false)
      expect(parsed.effort).toBeNull()
    })

    it('rejects an unknown marker kind', () => {
      expect(() => MarkerRowSchema.parse({id: 'm1', sessionId: 'conciv_1', afterTurn: 2, kind: 'weird'})).toThrow()
    })

    it('drafts are explicit about selection and default their attachments', () => {
      const draft = DraftRowSchema.parse({
        sessionId: 'conciv_1',
        text: 'hi',
        selectionStart: 2,
        selectionEnd: 2,
        updatedAt: 5,
      })
      expect(draft.selectionEnd).toBe(2)
      expect(draft.attachments).toEqual([])
    })
  })
})

describe('session header scoping', () => {
  const seen: (string | null)[] = []

  let server: Server
  let base = ''

  function listening(instance: Server): Promise<number> {
    return new Promise((resolve) => {
      instance.listen(0, '127.0.0.1', () => {
        const address = instance.address()
        resolve(typeof address === 'object' && address !== null ? address.port : 0)
      })
    })
  }

  beforeAll(async () => {
    server = createServer((request, response) => {
      const header = request.headers[CONCIV_SESSION_HEADER]
      seen.push(typeof header === 'string' ? header : null)
      request.resume()
      request.on('end', () => {
        response.writeHead(200, {'content-type': 'application/json'})
        response.end(JSON.stringify({json: {ok: true}, meta: []}))
      })
    })
    const port = await listening(server)
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    closeBrowserRpcConnection(base)
    await new Promise((resolve) => server.close(resolve))
  })

  it('each client on one api base sends its own session identity, and a session-less client sends none', async () => {
    const first = dynamicBrowserRpcLink(
      () => base,
      () => 'conciv_first',
    )
    const second = dynamicBrowserRpcLink(
      () => base,
      () => 'conciv_second',
    )
    const anonymous = dynamicBrowserRpcLink(() => base)

    await first.call(['probe'], {}, {context: {}})
    await second.call(['probe'], {}, {context: {}})
    await anonymous.call(['probe'], {}, {context: {}})
    await first.call(['probe'], {}, {context: {}})

    expect(seen).toEqual(['conciv_first', 'conciv_second', null, 'conciv_first'])
  }, 15_000)
})

describe('rpc reachability votes', () => {
  function respondOk(): Server {
    return createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        response.writeHead(200, {'content-type': 'application/json'})
        response.end(JSON.stringify({json: {ok: true}, meta: []}))
      })
    })
  }

  function listenOn(instance: Server, port: number): Promise<number> {
    return new Promise((resolve) => {
      instance.listen(port, '127.0.0.1', () => {
        const address = instance.address()
        resolve(typeof address === 'object' && address !== null ? address.port : 0)
      })
    })
  }

  function closed(instance: Server): Promise<void> {
    return new Promise((resolve) => instance.close(() => resolve()))
  }

  it('a listener subscribed before any connection exists hears the outage and the recovery, and stops after unsubscribe', async () => {
    const probe = createServer()
    const port = await listenOn(probe, 0)
    await closed(probe)
    const base = `http://127.0.0.1:${port}/engine`
    const votes: boolean[] = []
    const unsubscribe = subscribeRpcReachability(`${base}/`, (reachable) => votes.push(reachable))
    const link = dynamicBrowserRpcLink(() => base)
    const server = respondOk()

    const call = link.call(['probe'], {}, {context: {}})
    await vi.waitFor(() => expect(votes).toContain(false), {timeout: 2000})
    await listenOn(server, port)
    await call
    expect(votes.at(-1)).toBe(true)

    resetBrowserRpcConnection(base)
    await closed(server)
    const afterReset = link.call(['probe'], {}, {context: {}})
    await vi.waitFor(() => expect(votes.at(-1)).toBe(false), {timeout: 2000})
    const restarted = respondOk()
    await listenOn(restarted, port)
    await afterReset
    expect(votes.at(-1)).toBe(true)

    unsubscribe()
    const heard = votes.length
    await closed(restarted)
    await expect(link.call(['probe'], {}, {context: {}})).rejects.toThrow()
    expect(votes.length).toBe(heard)
    closeBrowserRpcConnection(base)
  }, 15_000)
})
