import {createServer, type Server} from 'node:http'
import {realpathSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createFakeHarness, harnessAvailable} from '@conciv/harness-testkit'
import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '@conciv/extension-terminal'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {claude} from '@conciv/harness/claude'
import {runConnect, type ConnectEvent} from '../src/connect.js'
import type {Engine} from '@conciv/core/start'

describe('conciv connect', () => {
  let shared: Engine
  const sharedEvents: ConnectEvent[] = []
  const sharedConnected = Promise.withResolvers<ConnectEvent>()

  beforeAll(async () => {
    shared = await runConnect({
      token: 'tok-shared',
      harnessAdapter: createFakeHarness({id: 'fake-shared'}),
      origin: 'http://127.0.0.1:1',
      onEvent: (event) => {
        sharedEvents.push(event)
        if (event.type === 'client-connected') sharedConnected.resolve(event)
      },
    })
  })

  afterAll(async () => {
    await shared.stop()
  })

  it('boots a token-gated core in range, emitting seeded and started, then client-connected on the first token request', async () => {
    expect(shared.port).toBeGreaterThanOrEqual(CONNECT_FIRST_PORT)
    expect(shared.port).toBeLessThanOrEqual(CONNECT_LAST_PORT)
    expect(sharedEvents).toEqual([
      {type: 'seeded', seeded: false},
      {type: 'started', port: shared.port, harness: 'fake-shared'},
    ])
    const health = await fetch(`http://127.0.0.1:${shared.port}/t/tok-shared/health`)
    expect(health.status).toBe(200)
    expect(await sharedConnected.promise).toEqual({type: 'client-connected'})
    expect(sharedEvents).toHaveLength(3)
  })

  it('runs with a connect-scenario system prompt (static page, page tools are the live surface)', () => {
    expect(shared.cfg.systemPrompt).toContain('static')
    expect(shared.cfg.systemPrompt).toContain('page tools')
    expect(shared.cfg.systemPrompt).not.toContain('picked up instantly by HMR')
  })

  it('uses a throwaway workspace by default', () => {
    expect(shared.cfg.stateRoot).not.toBe(process.cwd())
    expect(shared.cfg.stateRoot).toContain('conciv-connect-')
    expect(shared.cfg.stateRoot).toBe(realpathSync(shared.cfg.stateRoot))
  })

  it('rejects unsupported workspace paths instead of seeding them', async () => {
    await expect(
      runConnect({
        token: 'tok-path',
        workspace: '/tmp/user-workspace',
        harnessAdapter: createFakeHarness({id: 'fake-path'}),
      }),
    ).rejects.toThrow('workspace must be "." when provided')
  })

  it('mounts the terminal extension and reports no-terminal-mode for a tty-less harness', async () => {
    const rpc = makeExtRpcClient<TerminalRouter>(`http://127.0.0.1:${shared.port}/t/tok-shared`, 'terminal')
    const sessionId = `conciv_${randomUUID()}`
    expect(await rpc.state({sessionId})).toEqual({alive: false, busy: false})
    await expect(rpc.open({sessionId})).rejects.toMatchObject({
      code: 'NO_TTY',
      message: 'harness has no terminal mode',
    })
  })

  it('opens a live pty rooted in the throwaway workspace for a tty-capable harness', async () => {
    const captured: HarnessConnectContext[] = []
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
    try {
      const rpc = makeExtRpcClient<TerminalRouter>(`http://127.0.0.1:${engine.port}/t/tok-tty`, 'terminal')
      const sessionId = `conciv_${randomUUID()}`
      expect(await rpc.open({sessionId})).toEqual({alive: true})
      expect(captured[0]?.cwd).toBe(engine.cfg.stateRoot)
      expect((await rpc.state({sessionId})).alive).toBe(true)
    } finally {
      await engine.stop()
    }
  })

  it.skipIf(process.env.CI || !harnessAvailable(claude))(
    'opens a live claude tty in the throwaway workspace',
    async () => {
      const engine = await runConnect({token: 'tok-claude-tty', origin: 'http://127.0.0.1:1'})
      try {
        const rpc = makeExtRpcClient<TerminalRouter>(`http://127.0.0.1:${engine.port}/t/tok-claude-tty`, 'terminal')
        const sessionId = `conciv_${randomUUID()}`
        expect(await rpc.open({sessionId})).toEqual({alive: true})
        expect((await rpc.state({sessionId})).alive).toBe(true)
      } finally {
        await engine.stop()
      }
    },
    30_000,
  )

  it('skips the port held by a running engine', async () => {
    const engine = await runConnect({
      token: 'tok-second',
      harnessAdapter: createFakeHarness({id: 'fake-second'}),
      origin: 'http://127.0.0.1:1',
    })
    try {
      expect(engine.port).not.toBe(shared.port)
      const health = await fetch(`http://127.0.0.1:${engine.port}/t/tok-second/health`)
      expect(health.status).toBe(200)
    } finally {
      await engine.stop()
    }
  }, 20_000)

  it('walks the whole range, cleaning up each failed bind, and lands on the last free port', async () => {
    const bind = (port: number): Promise<Server | null> =>
      new Promise((resolve) => {
        const blocker = createServer(() => {})
        blocker.once('error', () => resolve(null))
        blocker.listen(port, '127.0.0.1', () => resolve(blocker))
      })
    const blockers: Server[] = []
    for (let port = CONNECT_FIRST_PORT; port <= CONNECT_LAST_PORT; port += 1) {
      const blocker = await bind(port)
      if (blocker) blockers.push(blocker)
    }
    const last = blockers.pop()
    if (!last) throw new Error('no free port available to release for the walk test')
    const freePort = (() => {
      const address = last.address()
      if (address === null || typeof address === 'string') throw new Error('blocker has no port')
      return address.port
    })()
    await new Promise<void>((resolve) => last.close(() => resolve()))
    try {
      const engine = await runConnect({
        token: 'tok-last',
        harnessAdapter: createFakeHarness({id: 'fake-last'}),
        origin: 'http://127.0.0.1:1',
      })
      try {
        expect(engine.port).toBe(freePort)
        const health = await fetch(`http://127.0.0.1:${freePort}/t/tok-last/health`)
        expect(health.status).toBe(200)
      } finally {
        await engine.stop()
      }
    } finally {
      blockers.forEach((blocker) => blocker.close())
    }
  }, 30_000)
})
