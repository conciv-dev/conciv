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
import type {TtyCommandOpts} from '@conciv/protocol/terminal-types'
import terminalExtension, {type TerminalRouter} from '../src/server.js'

export type FakeSessions = ServerSessions & {
  tokens: Map<string, string>
  busy: Set<string>
  fireChatTurn: (sessionId: string) => void
}

function fakeSessions(): FakeSessions {
  const tokens = new Map<string, string>()
  const busy = new Set<string>()
  const listeners: ((sessionId: string) => void)[] = []
  return {
    tokens,
    busy,
    fireChatTurn: (sessionId) => listeners.forEach((listener) => listener(sessionId)),
    resumeToken: (sessionId) => Promise.resolve(tokens.get(sessionId) ?? null),
    recordToken: (sessionId, token) => {
      tokens.set(sessionId, token)
      return Promise.resolve()
    },
    chatBusy: (sessionId) => busy.has(sessionId),
    model: () => Promise.resolve(null),
    onChatTurn: (listener) => listeners.push(listener),
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

export function recordingHarness(): {harness: ServerHarness; captured: TtyCommandOpts[]} {
  const captured: TtyCommandOpts[] = []
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

export async function startTerminalServer(harness: ServerHarness = bashHarness): Promise<TerminalTestServer> {
  const app = new Hono()
  app.use(cors())
  const sessions = fakeSessions()
  const api: ServerApi<Record<never, never>> = {
    config: {},
    cwd: process.cwd(),
    stateDir: concivStateDir(process.cwd()),
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
