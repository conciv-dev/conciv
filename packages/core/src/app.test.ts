import {describe, expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'

describe('http surface', () => {
  test('health answers, an untokened route is refused, a foreign origin is refused, and every reply carries the version', async () => {
    const engine = await createEngine({}, {harnesses: [{id: 'reviewer'}]})
    await engine.version('9.9.9')
    const origin = new URL(engine.address.apiBase).origin

    const health = await fetch(`${origin}/health`)
    expect(health.status).toBe(200)
    expect(health.headers.get('x-conciv-version')).toBe('9.9.9')
    expect(await health.json()).toMatchObject({ok: true, harness: 'reviewer', engine: {stale: false}})

    const untokened = await fetch(`${origin}/api/mcp`, {method: 'POST'})
    expect(untokened.status).toBe(401)
    expect(untokened.headers.get('x-conciv-version')).toBe('9.9.9')
    expect(await untokened.json()).toEqual({message: 'unauthorized'})

    const foreign = await fetch(`${origin}/health`, {headers: {origin: 'https://evil.example.com'}})
    expect(foreign.status).toBe(403)
    expect(foreign.headers.get('x-conciv-version')).toBe('9.9.9')
    expect(await foreign.text()).toBe('forbidden origin')
  })
})

describe('staleness', () => {
  test('a stale engine says so on health and at the top of the outside agent tool description', async () => {
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
