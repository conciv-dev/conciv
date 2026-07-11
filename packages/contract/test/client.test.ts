import {describe, expect, expectTypeOf, it} from 'vitest'
import type {SessionMeta} from '../src/rows.js'
import {makeRpcClient, type RpcClient} from '../src/client.js'

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
