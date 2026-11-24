import {once} from 'node:events'
import {IncomingMessage, request as httpRequest} from 'node:http'
import {text} from 'node:stream/consumers'
import {ConfigProvider} from 'effect'
import {z} from 'zod'
import {describe, expect} from 'vitest'
import {test} from '../test/engine.js'
import {resolveHarnessModels} from '@conciv/harness'
import {codex} from '@conciv/harness/codex'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {makeApp, withSavedModels} from './app.js'
import {resolveConfig} from './config.js'

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

describe('the saved model list', () => {
  test('a model probe that fails after a good listing keeps answering the last good list, across restarts', async () => {
    const stateDir = tempDir('saved-models-')
    const signal = new AbortController().signal
    const adapter = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')}))
    const listed = [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]
    const signedOut = () => Promise.reject(new Error('the CLI is signed out'))
    const unlogged = () => {}

    const first = await withSavedModels({...adapter, models: () => Promise.resolve(listed)}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(first.harness, {signal})).resolves.toEqual(listed)
    await first.settled()

    const failing = await withSavedModels({...adapter, models: signedOut}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(failing.harness, {signal})).resolves.toEqual(listed)
    await failing.settled()

    const afterFailure = await withSavedModels({...adapter, models: signedOut}, stateDir, signal, unlogged)
    await expect(resolveHarnessModels(afterFailure.harness, {signal})).resolves.toEqual(listed)
    await afterFailure.settled()
  })

  test('the engine starts listing the models before anyone asks, and the first ask reuses that listing', async () => {
    const signal = new AbortController().signal
    const adapter = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')}))
    const listed = [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]
    const listing = Promise.withResolvers<typeof listed>()
    const started: string[] = []
    const models = () => {
      started.push('listing')
      return listing.promise
    }

    const warmed = await withSavedModels({...adapter, models}, tempDir('saved-models-'), signal, () => {})
    expect(started).toEqual(['listing'])

    const asked = resolveHarnessModels(warmed.harness, {signal})
    listing.resolve(listed)
    await expect(asked).resolves.toEqual(listed)
    expect(started).toEqual(['listing'])
    await warmed.settled()

    const engineStarted: string[] = []
    const recorded = {
      ...adapter,
      models: () => {
        engineStarted.push('listing')
        return Promise.resolve(listed)
      },
    }
    const root = tempDir('app-root-')
    const configProvider = ConfigProvider.fromEnvRecord({CODEX_HOME: tempDir('codex-home-')})
    const made = await makeApp({
      cfg: resolveConfig({stateRoot: root}, root, configProvider),
      cwd: root,
      home: tempDir('app-home-'),
      configProvider,
      openInEditor: () => {},
      harness: recorded,
      harnesses: [recorded],
    })
    expect(engineStarted).toEqual(['listing'])
    await made.dispose()
  })
})
