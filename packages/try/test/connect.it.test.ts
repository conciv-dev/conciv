import {createServer} from 'node:http'
import {realpathSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {afterAll, describe, expect, it} from 'vitest'
import {createFakeHarness, harnessAvailable, until} from '@conciv/harness-testkit'
import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '@conciv/extension-terminal'
import type {TtyCommandOpts} from '@conciv/protocol/terminal-types'
import {claude} from '@conciv/harness/claude'
import {runConnect, type ConnectEvent} from '../src/connect.js'
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

  it('mounts the terminal extension and reports no-terminal-mode for a tty-less harness', async () => {
    const engine = await runConnect({
      token: 'tok-tty-less',
      harnessAdapter: createFakeHarness({id: 'fake-tty-less'}),
      origin: 'http://127.0.0.1:1',
    })
    engines.push(engine)
    const rpc = makeExtRpcClient<TerminalRouter>(`http://127.0.0.1:${engine.port}/t/tok-tty-less`, 'terminal')
    const sessionId = `conciv_${randomUUID()}`
    expect(await rpc.state({sessionId})).toEqual({alive: false, busy: false})
    await expect(rpc.open({sessionId})).rejects.toMatchObject({
      code: 'NO_TTY',
      message: 'harness has no terminal mode',
    })
  })

  it('opens a live pty rooted in the throwaway workspace for a tty-capable harness', async () => {
    const captured: TtyCommandOpts[] = []
    const engine = await runConnect({
      token: 'tok-tty',
      harnessAdapter: createFakeHarness({
        id: 'fake-tty',
        tty: {
          command: (commandOpts) => {
            captured.push(commandOpts)
            return {bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}
          },
        },
      }),
      origin: 'http://127.0.0.1:1',
    })
    engines.push(engine)
    const rpc = makeExtRpcClient<TerminalRouter>(`http://127.0.0.1:${engine.port}/t/tok-tty`, 'terminal')
    const sessionId = `conciv_${randomUUID()}`
    expect(await rpc.open({sessionId})).toEqual({alive: true})
    expect(captured[0]?.cwd).toBe(engine.cfg.stateRoot)
    expect((await rpc.state({sessionId})).alive).toBe(true)
  })

  it.skipIf(process.env.CI || !harnessAvailable(claude))(
    'opens a live claude tty in the throwaway workspace',
    async () => {
      const engine = await runConnect({token: 'tok-claude-tty', origin: 'http://127.0.0.1:1'})
      engines.push(engine)
      const rpc = makeExtRpcClient<TerminalRouter>(`http://127.0.0.1:${engine.port}/t/tok-claude-tty`, 'terminal')
      const sessionId = `conciv_${randomUUID()}`
      expect(await rpc.open({sessionId})).toEqual({alive: true})
      await until(async () => (await rpc.state({sessionId})).alive)
    },
    30_000,
  )

  it('emits seeded, started, then client-connected on the first token request', async () => {
    const events: ConnectEvent[] = []
    const engine = await runConnect({
      token: 'tok-events',
      harnessAdapter: createFakeHarness({id: 'fake-events'}),
      origin: 'http://127.0.0.1:1',
      onEvent: (event) => events.push(event),
    })
    engines.push(engine)
    expect(events).toEqual([
      {type: 'seeded', seeded: false},
      {type: 'started', port: engine.port, harness: 'fake-events'},
    ])
    await fetch(`http://127.0.0.1:${engine.port}/t/tok-events/health`)
    await until(() => events.length === 3)
    expect(events[2]).toEqual({type: 'client-connected'})
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
