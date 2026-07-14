import {createServer} from 'node:http'
import {afterAll, describe, expect, it} from 'vitest'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '../src/connect.js'
import type {Engine} from '@conciv/core/start'

const engines: Engine[] = []
const closers: Array<() => void> = []

afterAll(async () => {
  await Promise.all(engines.map((engine) => engine.stop()))
  closers.forEach((close) => close())
})

describe('conciv connect', () => {
  it('boots a token-gated core on the first free port in range', async () => {
    const engine = await runConnect({token: 'tok-a', harnessAdapter: createFakeHarness({id: 'fake-connect'})})
    engines.push(engine)
    expect(engine.port).toBeGreaterThanOrEqual(4732)
    expect(engine.port).toBeLessThanOrEqual(4741)
    const health = await fetch(`http://127.0.0.1:${engine.port}/t/tok-a/health`)
    expect(health.status).toBe(200)
  })

  it('skips an occupied port', async () => {
    const blocker = createServer(() => {})
    await new Promise<void>((resolve) => {
      blocker.once('error', () => resolve())
      blocker.listen(4732, '127.0.0.1', () => resolve())
    })
    closers.push(() => blocker.close())
    const engine = await runConnect({token: 'tok-b', harnessAdapter: createFakeHarness({id: 'fake-busy'})})
    engines.push(engine)
    expect(engine.port).toBeGreaterThan(4732)
  }, 20_000)

  it('uses a throwaway workspace by default', async () => {
    const engine = await runConnect({token: 'tok-c', harnessAdapter: createFakeHarness({id: 'fake-ws'})})
    engines.push(engine)
    expect(engine.cfg.stateRoot).not.toBe(process.cwd())
    expect(engine.cfg.stateRoot).toContain('conciv-connect-')
  })
})
