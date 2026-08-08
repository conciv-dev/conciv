import {Hono} from 'hono'
import {cors} from 'hono/cors'
import type {AnyRouter} from '@orpc/server'
import {concivStateDir} from '@conciv/protocol/state-types'
import {serveExtensionRpc} from '@conciv/harness-testkit/rpc-mounts'
import {makeExtRpcClient, type ServerApi, type ServerHarness, type ServerSessions} from '@conciv/extension'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import terminalExtension, {type TerminalRouter} from '../src/server.js'

export type FakeSessions = ServerSessions & {tokens: Map<string, string>}

function fakeSessions(): FakeSessions {
  const tokens = new Map<string, string>()
  return {
    tokens,
    resumeToken: (sessionId) => Promise.resolve(tokens.get(sessionId) ?? null),
    recordToken: (sessionId, token) => {
      tokens.set(sessionId, token)
      return Promise.resolve()
    },
    chatBusy: () => false,
    model: () => Promise.resolve(null),
    onChatTurn: () => {},
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
      ttyCommand: (ctx) => {
        captured.push(ctx)
        return command(ctx)
      },
    },
  }
}

export function connectingHarness(): {harness: ServerHarness; captured: HarnessConnectContext[]} {
  const captured: HarnessConnectContext[] = []
  return {
    captured,
    harness: {
      ...bashHarness,
      connectPlan: (ctx) => {
        captured.push(ctx)
        return {
          argv: ['fake-cli', '--session', ctx.harnessSessionId ?? 'new', ...(ctx.mcpUrl ? ['--mcp', ctx.mcpUrl] : [])],
          env: {CONCIV_LAUNCH: 'yes'},
          files: [],
        }
      },
    },
  }
}

export type TerminalTestServer = {
  base: string
  wsBase: string
  rpcWsUrl: string
  sessions: FakeSessions
  stateDir: string
  rpc: ReturnType<typeof makeExtRpcClient<TerminalRouter>>
  close: () => Promise<void>
}

function isRouter(candidate: unknown): candidate is AnyRouter {
  return typeof candidate === 'object' && candidate !== null
}

export async function startTerminalServer(
  harness: ServerHarness = bashHarness,
  opts: {basePath?: string; stateDir?: string} = {},
): Promise<TerminalTestServer> {
  const stateDir = opts.stateDir ?? concivStateDir(process.cwd())
  const app = new Hono()
  app.use(cors())
  const sessions = fakeSessions()
  const api: ServerApi<Record<never, never>> = {
    config: {},
    cwd: process.cwd(),
    basePath: opts.basePath ?? '',
    stateDir,
    sessions,
    harness,
    page: {
      call: () => Promise.reject(new Error('terminal tests attach no page')),
    },
    tools: {
      call: () => Promise.reject(new Error('terminal tests attach no tool registry')),
    },
    symbolicate: async () => null,
    nativeUrl: () => undefined,
  }
  const result = await terminalExtension.__server?.(api)
  if (!(result?.app instanceof Hono)) throw new Error('terminal extension returned no hono app')
  if (!isRouter(result.router)) throw new Error('terminal extension returned no router')
  app.route('/api/ext/terminal', result.app)
  const served = await serveExtensionRpc({slug: 'terminal', router: result.router, app})
  return {
    base: served.base,
    wsBase: served.wsBase,
    rpcWsUrl: served.wsUrl,
    sessions,
    stateDir,
    rpc: makeExtRpcClient<TerminalRouter>(served.base, 'terminal'),
    close: async () => {
      await result?.dispose?.()
      await served.close()
    },
  }
}
