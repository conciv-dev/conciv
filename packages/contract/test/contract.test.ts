import {describe, expect, expectTypeOf, it, afterAll, beforeAll} from 'vitest'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from '../src/rows.js'
import type {SessionMeta} from '../src/rows.js'
import {makeBrowserRpcClient, makeRpcClient, type RpcClient} from '../src/client.js'
import {createServer, type Server} from 'node:http'
import {CONCIV_VERSION_HEADER} from '@conciv/protocol/rpc-types'
import contractManifest from '../package.json' with {type: 'json'}

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
  })
})

describe('rows', () => {
  describe('row schemas', () => {
    it('parses a session meta', () => {
      const parsed = SessionMetaSchema.parse({
        id: 'conciv_1',
        title: 'hello',
        updatedAt: 1,
        sizeBytes: 0,
        running: false,
        origin: 'conciv',
        usage: null,
        model: null,
        effort: null,
        hidden: false,
        native: null,
        harnessKind: 'claude',
      })
      expect(parsed.hidden).toBe(false)
      expect(parsed.effort).toBeNull()
    })

    it('rejects an unknown marker kind', () => {
      expect(() =>
        MarkerRowSchema.parse({id: 'm1', sessionId: 'conciv_1', afterMessageId: 'msg-1', kind: 'weird'}),
      ).toThrow()
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

describe('node rpc client', () => {
  const versions: (string | null)[] = []

  let server: Server
  let base = ''

  beforeAll(async () => {
    server = createServer((request, response) => {
      const version = request.headers[CONCIV_VERSION_HEADER]
      versions.push(typeof version === 'string' ? version : null)
      request.resume()
      request.on('end', () => {
        response.writeHead(200, {'content-type': 'application/json'})
        response.end(JSON.stringify({json: {ok: true}, meta: []}))
      })
    })
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address !== null ? address.port : 0)
      })
    })
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('the node rpc client tells the engine the contract release version', async () => {
    await makeRpcClient(base).sessions.list(undefined)

    expect(versions).toEqual([contractManifest.version])
  }, 15_000)
})
