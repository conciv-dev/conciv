import {ConfigProvider} from 'effect'
import {describe, expect, test} from 'vitest'
import {resolveHarnessModels} from '@conciv/harness'
import {codex} from '@conciv/harness/codex'
import {createEngine} from '@conciv/plugin-testkit'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {withSavedModels} from './app.js'

describe('http surface', () => {
  test('health answers, an untokened route is refused, a foreign origin is refused, and every reply carries the version', async () => {
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
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    })

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

describe('the saved model list', () => {
  test('a model probe that fails after a good listing keeps answering the last good list, across restarts', async () => {
    const stateDir = tempDir('saved-models-')
    const signal = new AbortController().signal
    const adapter = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')}))
    const listed = [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]
    const signedOut = () => Promise.reject(new Error('the CLI is signed out'))
    const unlogged = () => {}

    const first = withSavedModels({...adapter, models: () => Promise.resolve(listed)}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(first.harness, {signal})).resolves.toEqual(listed)
    await first.settled()

    const failing = withSavedModels({...adapter, models: signedOut}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(failing.harness, {signal})).resolves.toEqual(listed)
    await failing.settled()

    const afterFailure = withSavedModels({...adapter, models: signedOut}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(afterFailure.harness, {signal})).resolves.toEqual(listed)
    await afterFailure.settled()
  })
})
