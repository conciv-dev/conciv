import {once} from 'node:events'
import {IncomingMessage, request as httpRequest} from 'node:http'
import {text} from 'node:stream/consumers'
import {z} from 'zod'
import {describe, expect} from 'vitest'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM} from '@conciv/types/rpc-types'
import {test} from '../utils/engine-test.js'

describe('http surface', () => {
  test('health answers, an untokened route is refused, a foreign origin or a Host that is not loopback is refused, and every reply carries the version', async ({
    createEngine,
  }) => {
    const engine = await createEngine({}, {harnesses: [{id: 'reviewer'}]})
    await engine.version('9.9.9')
    const origin = new URL(engine.address.apiBase).origin

    const health = await fetch(`${origin}/health`)
    expect(health.status).toBe(200)
    expect(health.headers.get('x-conciv-version')).toBe('9.9.9')
    expect(await health.json()).toMatchObject({
      ok: true,
      harness: 'reviewer',
      engine: {stale: false},
      id: expect.stringMatching(/^eng_[0-9A-Za-z]{26}$/),
    })

    const untokened = await fetch(`${origin}/api/mcp`, {method: 'POST'})
    expect(untokened.status).toBe(401)
    expect(untokened.headers.get('x-conciv-version')).toBe('9.9.9')
    expect(await untokened.json()).toEqual({message: 'unauthorized'})

    const foreign = await fetch(`${origin}/health`, {headers: {origin: 'https://evil.example.com'}})
    expect(foreign.status).toBe(403)
    expect(foreign.headers.get('x-conciv-version')).toBe('9.9.9')
    expect(await foreign.text()).toBe('forbidden origin')

    const rpc = new URL(`${engine.address.apiBase}/rpc/plugin/experimental`)
    rpc.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, engine.address.token)
    const unknownPlugin = await fetch(rpc, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: {id: 'no-such-plugin'}}),
    })
    expect(unknownPlugin.status).toBe(404)
    expect(await unknownPlugin.json()).toMatchObject({json: {code: 'PLUGIN_NOT_FOUND'}})

    for (const path of ['/health', '/api/mcp']) {
      const rebound = httpRequest({
        hostname: '127.0.0.1',
        port: new URL(origin).port,
        path,
        method: 'POST',
        setHost: false,
        headers: {host: `evil.example.com:${new URL(origin).port}`},
      })
      rebound.end()
      const [response] = await once(rebound, 'response')
      const reply = z.instanceof(IncomingMessage).parse(response)
      expect({status: reply.statusCode, body: await text(reply)}).toEqual({status: 403, body: 'forbidden host'})
    }
  })
})

describe('staleness', () => {
  test('a stale engine says so on health and at the top of the outside agent tool description', async ({
    createEngine,
  }) => {
    const engine = await createEngine()
    await engine.stale({
      stale: true,
      changed: ['src/routes/cart.ts'],
      tracked: ['src/routes/cart.ts'],
      bootedAt: 0,
      fingerprint: 'rebuilt',
    })

    const health = await fetch(`${new URL(engine.address.apiBase).origin}/health`)
    expect(await health.json()).toMatchObject({engine: {stale: true}})
    const {execute} = await engine.outside().describe()
    expect(execute).toMatch(/^WARNING: this engine is running outdated code\./)
    expect(execute).toContain('src/routes/cart.ts')
  })
})
