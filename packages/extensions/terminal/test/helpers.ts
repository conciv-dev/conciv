import {afterEach} from 'vitest'
import {Hono} from 'hono'
import {cors} from 'hono/cors'
import {RPCHandler} from '@orpc/server/fetch'
import type {AnyRouter} from '@orpc/server'
import {concivStateDir} from '@conciv/protocol/state-types'
import {serveApp} from '@conciv/harness-testkit'
import {
  makeExtRpcClient,
  noWidgetPageCaller,
  type ServerApi,
  type ServerHarness,
  type ServerSessions,
} from '@conciv/extension'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import type {SendVerdict} from '@conciv/protocol/chat-types'
import terminalExtension, {type TerminalRouter} from '../src/server.js'

export type FakeSessions = ServerSessions & {
  tokens: Map<string, string>
  busy: Set<string>
  changes: {count: number}
  listeners: {localRun: number; detached: number; launch: number; mcp: number; veto: number}
  fireLocalRun: (sessionId: string, phase: 'start' | 'end') => void
  fireSessionDetached: (sessionId: string) => void
  fireLaunch: (sessionId: string) => void
  fireMcpRequest: (sessionId: string) => void
  runSend: (sessionId: string, force: boolean) => SendVerdict
}

function makeChannel<Listener>(counts: {value: number}): {
  add: (listener: Listener) => () => void
  all: () => Listener[]
} {
  const listeners: Listener[] = []
  return {
    add: (listener) => {
      listeners.push(listener)
      counts.value += 1
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
        counts.value -= 1
      }
    },
    all: () => [...listeners],
  }
}

function fakeSessions(): FakeSessions {
  const tokens = new Map<string, string>()
  const busy = new Set<string>()
  const changes = {count: 0}
  const counts = {
    localRun: {value: 0},
    detached: {value: 0},
    launch: {value: 0},
    mcp: {value: 0},
    veto: {value: 0},
  }
  const localRun = makeChannel<(sessionId: string, phase: 'start' | 'end') => void>(counts.localRun)
  const detached = makeChannel<(sessionId: string) => void>(counts.detached)
  const launch = makeChannel<(sessionId: string) => void>(counts.launch)
  const mcp = makeChannel<(sessionId: string) => void>(counts.mcp)
  const vetoes = makeChannel<(sessionId: string, opts: {force: boolean}) => SendVerdict>(counts.veto)
  return {
    tokens,
    busy,
    changes,
    get listeners() {
      return {
        localRun: counts.localRun.value,
        detached: counts.detached.value,
        launch: counts.launch.value,
        mcp: counts.mcp.value,
        veto: counts.veto.value,
      }
    },
    fireLocalRun: (sessionId, phase) => localRun.all().forEach((listener) => listener(sessionId, phase)),
    fireSessionDetached: (sessionId) => detached.all().forEach((listener) => listener(sessionId)),
    fireLaunch: (sessionId) => launch.all().forEach((listener) => listener(sessionId)),
    fireMcpRequest: (sessionId) => mcp.all().forEach((listener) => listener(sessionId)),
    runSend: (sessionId, force) => {
      for (const veto of vetoes.all()) {
        const verdict = veto(sessionId, {force})
        if (!verdict.allow) return verdict
      }
      return {allow: true}
    },
    resumeToken: (sessionId) => Promise.resolve(tokens.get(sessionId) ?? null),
    recordToken: (sessionId, token) => {
      if (tokens.get(sessionId) === token) return Promise.resolve('kept')
      const taken = [...tokens.entries()].some(([id, value]) => value === token && id !== sessionId)
      if (taken) return Promise.resolve('conflict')
      tokens.set(sessionId, token)
      return Promise.resolve('recorded')
    },
    sessionForHarnessId: (harnessSessionId) => {
      const owner = [...tokens.entries()].find(([, token]) => token === harnessSessionId)
      return Promise.resolve(owner?.[0] ?? null)
    },
    chatBusy: (sessionId) => busy.has(sessionId),
    model: () => Promise.resolve(null),
    onLocalRun: (listener) => localRun.add(listener),
    onSessionDetached: (listener) => detached.add(listener),
    onLaunch: (listener) => launch.add(listener),
    beforeSend: (check) => vetoes.add(check),
    onMcpRequest: (listener) => mcp.add(listener),
    notifyChange: () => {
      changes.count += 1
    },
  }
}

const SPAWN_PAINT_SCRIPT = `
cols=$(stty size | cut -d' ' -f2)
printf 'SPAWNCOLS=%s\\n' "$cols"
printf 'SPAWNRULER['
i=12
while [ $i -lt $cols ]; do printf '='; i=$((i+1)); done
printf ']\\n'
exec bash --noprofile --norc -i
`

export const spawnPaintHarness: ServerHarness = {
  id: 'test-tty-spawn-paint',
  ttyCommand: () => ({bin: 'bash', args: ['-c', SPAWN_PAINT_SCRIPT], env: {TERM: 'xterm-256color', PS1: 'P> '}}),
  release: () => {},
}

export const bashHarness: ServerHarness = {
  id: 'test-tty',
  ttyCommand: () => ({bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}),
  release: () => {},
}

export function recordingHarness(): {harness: ServerHarness; captured: HarnessConnectContext[]} {
  const captured: HarnessConnectContext[] = []
  const command = bashHarness.ttyCommand
  if (!command) throw new Error('bash harness has no tty command')
  return {
    captured,
    harness: {
      ...bashHarness,
      ttyCommand: (opts) => {
        captured.push(opts)
        return command(opts)
      },
    },
  }
}

export type TerminalTestServer = {
  base: string
  wsBase: string
  sessions: FakeSessions
  rpc: ReturnType<typeof makeExtRpcClient<TerminalRouter>>
  close: () => Promise<void>
}

function isRouter(candidate: unknown): candidate is AnyRouter {
  return typeof candidate === 'object' && candidate !== null
}

export async function startTerminalServer(
  harness: ServerHarness = bashHarness,
  basePath = '',
  stateDir = concivStateDir(process.cwd()),
): Promise<TerminalTestServer> {
  const app = new Hono()
  app.use(cors())
  const sessions = fakeSessions()
  const api: ServerApi<Record<never, never>> = {
    config: {},
    cwd: process.cwd(),
    basePath,
    stateDir,
    sessions,
    harness,
    page: noWidgetPageCaller('terminal'),
    nativeUrl: () => undefined,
  }
  const result = await terminalExtension.__server?.(api)
  if (!(result?.app instanceof Hono)) throw new Error('terminal extension returned no hono app')
  if (!isRouter(result.router)) throw new Error('terminal extension returned no router')
  app.route('/api/ext/terminal', result.app)
  const handler = new RPCHandler(result.router)
  app.use('/rpc/ext/terminal/*', async (c, next) => {
    const {matched, response} = await handler.handle(c.req.raw, {
      prefix: '/rpc/ext/terminal',
      context: {request: c.req.raw},
    })
    if (matched && response) return c.newResponse(response.body, response)
    await next()
  })
  const served = await serveApp(app.fetch)
  return {
    base: served.base,
    wsBase: served.wsBase,
    sessions,
    rpc: makeExtRpcClient<TerminalRouter>(served.base, 'terminal'),
    close: async () => {
      await result?.dispose?.()
      await served.close()
    },
  }
}

export function closeServersAfterEach(): {servers: TerminalTestServer[]} {
  const open: {servers: TerminalTestServer[]} = {servers: []}
  afterEach(async () => {
    const servers = open.servers.splice(0)
    await Promise.all(servers.map((server) => server.close()))
  })
  return open
}
