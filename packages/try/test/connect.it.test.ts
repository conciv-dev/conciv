import {createServer} from 'node:http'
import {realpathSync} from 'node:fs'
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
    const engine = await runConnect({
      token: 'tok-a',
      harnessAdapter: createFakeHarness({id: 'fake-connect'}),
      origin: 'http://127.0.0.1:1',
    })
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
    const engine = await runConnect({
      token: 'tok-b',
      harnessAdapter: createFakeHarness({id: 'fake-busy'}),
      origin: 'http://127.0.0.1:1',
    })
    engines.push(engine)
    expect(engine.port).toBeGreaterThan(4732)
  }, 20_000)

  it('runs with a connect-scenario system prompt (static page, page tools are the live surface)', async () => {
    const engine = await runConnect({
      token: 'tok-d',
      harnessAdapter: createFakeHarness({id: 'fake-prompt'}),
      origin: 'http://127.0.0.1:1',
    })
    engines.push(engine)
    expect(engine.cfg.systemPrompt).toContain('static')
    expect(engine.cfg.systemPrompt).toContain('page tools')
    expect(engine.cfg.systemPrompt).not.toContain('picked up instantly by HMR')
  })

  it('uses a throwaway workspace by default', async () => {
    const engine = await runConnect({
      token: 'tok-c',
      harnessAdapter: createFakeHarness({id: 'fake-ws'}),
      origin: 'http://127.0.0.1:1',
    })
    engines.push(engine)
    expect(engine.cfg.stateRoot).not.toBe(process.cwd())
    expect(engine.cfg.stateRoot).toContain('conciv-connect-')
    expect(engine.cfg.stateRoot).toBe(realpathSync(engine.cfg.stateRoot))
  })

  it('rejects unsupported workspace paths instead of seeding them', async () => {
    await expect(
      runConnect({
        token: 'tok-e',
        workspace: '/tmp/user-workspace',
        harnessAdapter: createFakeHarness({id: 'fake-path'}),
      }),
    ).rejects.toThrow('workspace must be "." when provided')
  })

  it('walks the whole range, cleaning up each failed bind, and lands on the last free port', async () => {
    const occupy = (port: number): Promise<void> =>
      new Promise((resolve) => {
        const blocker = createServer(() => {})
        blocker.once('error', () => resolve())
        blocker.listen(port, '127.0.0.1', () => {
          closers.push(() => blocker.close())
          resolve()
        })
      })
    for (let port = 4732; port <= 4740; port += 1) await occupy(port)
    const engine = await runConnect({
      token: 'tok-last',
      harnessAdapter: createFakeHarness({id: 'fake-last'}),
      origin: 'http://127.0.0.1:1',
    })
    engines.push(engine)
    expect(engine.port).toBe(4741)
    const health = await fetch('http://127.0.0.1:4741/t/tok-last/health')
    expect(health.status).toBe(200)
  }, 30_000)
})
