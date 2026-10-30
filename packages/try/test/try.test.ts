import {describe, expect, it, afterAll, beforeAll} from 'vitest'
import {attachCommand, plainLines} from '../src/cli.js'
import {createServer, type Server} from 'node:http'
import {realpathSync, existsSync, mkdtempSync, readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createFakeHarness, harnessAvailable} from '@conciv/harness-testkit'
import {makeExtRpcClient} from '@conciv/extension'
import {type TerminalRouter} from '@conciv/extension-terminal'
import {type HarnessConnectContext} from '@conciv/protocol/harness-types'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {claude} from '@conciv/harness/claude'
import {runConnect, type ConnectEvent} from '../src/connect.js'
import {type Engine} from '@conciv/core/start'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {seedWorkspace} from '../src/seed-workspace.js'

describe('cli', () => {
  describe('plainLines', () => {
    it('keeps the greppable connected line and prints the mcp attach command', () => {
      const lines = plainLines({type: 'started', port: 4732, harness: 'claude'}, 'tok-1')
      expect(lines[0]).toBe('connected: conciv core on 127.0.0.1:4732 (harness: claude)')
      expect(lines[1]).toBe('return to your browser tab and keep this command running')
      expect(lines[3]).toBe(`  ${attachCommand(4732, 'tok-1')}`)
    })
    it('renders both seed outcomes', () => {
      expect(plainLines({type: 'seeded', seeded: true}, 'tok-1')).toEqual([
        'workspace seeded with the landing-page source',
      ])
      expect(plainLines({type: 'seeded', seeded: false}, 'tok-1')).toEqual([
        'no source manifest found, continuing unseeded',
      ])
    })
    it('announces browser pairing', () => {
      expect(plainLines({type: 'client-connected'}, 'tok-1')).toEqual(['browser paired: the widget is live'])
    })
  })

  describe('attachCommand', () => {
    it('builds a session-scoped claude --continue command with the token-gated mcp url', () => {
      const command = attachCommand(4733, 'tok-abc')
      expect(command).toContain('claude --continue --mcp-config ')
      expect(command).toContain('http://127.0.0.1:4733/t/tok-abc/api/mcp')
      expect(command).toContain('"alwaysLoad":true')
      expect(command).not.toContain('--strict-mcp-config')
    })
  })
})

describe('connect', () => {
  describe('conciv connect', () => {
    let shared: Engine
    const engines: Engine[] = []
    const closers: Array<() => void> = []
    const sharedEvents: ConnectEvent[] = []
    const sharedConnected = Promise.withResolvers<ConnectEvent>()

    beforeAll(async () => {
      shared = await runConnect({
        token: '11111111-1111-4111-8111-111111111111',
        harnessAdapter: createFakeHarness({id: 'fake-shared'}),
        origin: 'http://127.0.0.1:1',
        onEvent: (event) => {
          sharedEvents.push(event)
          if (event.type === 'client-connected') sharedConnected.resolve(event)
        },
      })
    })

    afterAll(async () => {
      await Promise.all([shared, ...engines].map((engine) => engine.stop()))
      closers.forEach((close) => close())
    })

    it('boots a token-gated core in range, emitting seeded and started, then client-connected on the first token request', async () => {
      expect(shared.port).toBeGreaterThanOrEqual(CONNECT_FIRST_PORT)
      expect(shared.port).toBeLessThanOrEqual(CONNECT_LAST_PORT)
      expect(sharedEvents).toEqual([
        {type: 'seeded', seeded: false},
        {type: 'started', port: shared.port, harness: 'fake-shared'},
      ])
      const health = await fetch(`http://127.0.0.1:${shared.port}/t/11111111-1111-4111-8111-111111111111/health`)
      expect(health.status).toBe(200)
      expect(await sharedConnected.promise).toEqual({type: 'client-connected'})
      expect(sharedEvents).toHaveLength(3)
    })

    it('runs with a connect-scenario system prompt (static page, page capabilities are the live surface)', () => {
      expect(shared.cfg.systemPrompt).toContain('static')
      expect(shared.cfg.systemPrompt).toContain('page capabilities')
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
          token: '22222222-2222-4222-8222-222222222222',
          workspace: '/tmp/user-workspace',
          harnessAdapter: createFakeHarness({id: 'fake-path'}),
        }),
      ).rejects.toThrow('workspace must be "." when provided')
    })

    it('mounts the terminal extension and reports no-terminal-mode for a tty-less harness', async () => {
      const rpc = makeExtRpcClient<TerminalRouter>(
        `http://127.0.0.1:${shared.port}/t/11111111-1111-4111-8111-111111111111`,
        'terminal',
      )
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
        token: '33333333-3333-4333-8333-333333333333',
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
      const rpc = makeExtRpcClient<TerminalRouter>(
        `http://127.0.0.1:${engine.port}/t/33333333-3333-4333-8333-333333333333`,
        'terminal',
      )
      const sessionId = `conciv_${randomUUID()}`
      expect(await rpc.open({sessionId})).toEqual({alive: true})
      expect(captured[0]?.cwd).toBe(engine.cfg.stateRoot)
      expect((await rpc.state({sessionId})).alive).toBe(true)
    })

    it.skipIf(process.env.CI || !harnessAvailable(claude))(
      'opens a live claude tty in the throwaway workspace',
      async () => {
        const engine = await runConnect({token: '44444444-4444-4444-8444-444444444444', origin: 'http://127.0.0.1:1'})
        engines.push(engine)
        const rpc = makeExtRpcClient<TerminalRouter>(
          `http://127.0.0.1:${engine.port}/t/44444444-4444-4444-8444-444444444444`,
          'terminal',
        )
        const sessionId = `conciv_${randomUUID()}`
        expect(await rpc.open({sessionId})).toEqual({alive: true})
        expect((await rpc.state({sessionId})).alive).toBe(true)
      },
      30_000,
    )

    it('skips the port held by a running engine', async () => {
      const engine = await runConnect({
        token: '55555555-5555-4555-8555-555555555555',
        harnessAdapter: createFakeHarness({id: 'fake-second'}),
        origin: 'http://127.0.0.1:1',
      })
      engines.push(engine)
      expect(engine.port).not.toBe(shared.port)
      const health = await fetch(`http://127.0.0.1:${engine.port}/t/55555555-5555-4555-8555-555555555555/health`)
      expect(health.status).toBe(200)
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
      blockers.forEach((blocker) => closers.push(() => blocker.close()))
      const engine = await runConnect({
        token: '66666666-6666-4666-8666-666666666666',
        harnessAdapter: createFakeHarness({id: 'fake-last'}),
        origin: 'http://127.0.0.1:1',
      })
      engines.push(engine)
      expect(engine.port).toBe(freePort)
      const health = await fetch(`http://127.0.0.1:${freePort}/t/66666666-6666-4666-8666-666666666666/health`)
      expect(health.status).toBe(200)
    }, 30_000)
  })
})

describe('seed workspace', () => {
  const servers: Server[] = []

  function serveManifest(body: string, status = 200): Promise<string> {
    const server = createServer((request, response) => {
      if (request.url === '/site-source.json') {
        response.writeHead(status, {'content-type': 'application/json'})
        response.end(body)
        return
      }
      response.writeHead(404)
      response.end()
    })
    servers.push(server)
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '')
      })
    })
  }

  afterAll(() => {
    servers.forEach((server) => server.close())
  })

  describe('seedWorkspace', () => {
    it('writes manifest files and AGENTS.md into the workspace', async () => {
      const origin = await serveManifest(
        JSON.stringify({'src/components/landing/hero.tsx': 'export function Hero() {}\n', 'package.json': '{}\n'}),
      )
      const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      const seeded = await seedWorkspace(origin, root)
      expect(seeded).toBe(true)
      expect(readFileSync(join(root, 'src/components/landing/hero.tsx'), 'utf8')).toContain('Hero')
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('data-conciv-source')
    })

    it('only writes src/** and package.json, dropping escaping and out-of-tree paths', async () => {
      const origin = await serveManifest(
        JSON.stringify({
          '../evil.txt': 'nope',
          '/abs.txt': 'nope',
          'CLAUDE.md': 'planted context',
          '.mcp.json': '{}',
          'src\\win.ts': 'nope',
          'src/ok.ts': 'export const ok = 1\n',
          'package.json': '{}\n',
        }),
      )
      const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      const seeded = await seedWorkspace(origin, root)
      expect(seeded).toBe(true)
      expect(existsSync(join(root, 'src/ok.ts'))).toBe(true)
      expect(existsSync(join(root, 'package.json'))).toBe(true)
      expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
      expect(existsSync(join(root, 'abs.txt'))).toBe(false)
      expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false)
      expect(existsSync(join(root, '.mcp.json'))).toBe(false)
    })

    it('skips non-string manifest values and non-object payloads', async () => {
      const origin = await serveManifest(JSON.stringify({'src/ok.ts': 'export const ok = 1\n', 'src/bad.ts': 123}))
      const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      expect(await seedWorkspace(origin, root)).toBe(true)
      expect(existsSync(join(root, 'src/ok.ts'))).toBe(true)
      expect(existsSync(join(root, 'src/bad.ts'))).toBe(false)

      const arrayOrigin = await serveManifest(JSON.stringify(['src/x.ts']))
      const arrayRoot = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      expect(await seedWorkspace(arrayOrigin, arrayRoot)).toBe(true)
      expect(existsSync(join(arrayRoot, 'src/x.ts'))).toBe(false)
    })

    it('returns false and writes nothing when the manifest is missing', async () => {
      const origin = await serveManifest('not found', 404)
      const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      const seeded = await seedWorkspace(origin, root)
      expect(seeded).toBe(false)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
    })

    it('returns false when the origin is unreachable', async () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      const seeded = await seedWorkspace('http://127.0.0.1:1', root)
      expect(seeded).toBe(false)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
    })

    it('rejects a manifest larger than the size cap', async () => {
      const origin = await serveManifest(JSON.stringify({'src/big.ts': 'x'.repeat(9 * 1024 * 1024)}))
      const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
      const seeded = await seedWorkspace(origin, root)
      expect(seeded).toBe(false)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
    })
  })
})
