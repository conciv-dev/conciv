import {H3, withBase} from 'h3'
import {serve, type Server} from 'srvx'
import type {Hooks} from 'crossws'
import nodeWebSocketAdapter from 'crossws/adapters/node'
import type {ServerApi, ServerHarness, ServerSessions} from '@conciv/extension'
import type {TtyCommandOpts} from '@conciv/protocol/terminal-types'
import terminalExtension from '../src/server.js'

declare global {
  interface Response {
    crossws?: Partial<Hooks>
  }
}

export type FakeSessions = ServerSessions & {
  tokens: Map<string, string>
  busy: Set<string>
  fireChatTurn: (sessionId: string) => void
}

export function fakeSessions(): FakeSessions {
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
  close: () => Promise<void>
}

export async function startTerminalServer(harness: ServerHarness = bashHarness): Promise<TerminalTestServer> {
  const app = new H3()
  const sub = new H3()
  app.use('/api/ext/terminal/**', withBase('/api/ext/terminal', sub.handler))
  const sessions = fakeSessions()
  const api: ServerApi<Record<never, never>> = {config: {}, cwd: process.cwd(), app: sub, sessions, harness}
  const result = await terminalExtension.__server?.(api)
  const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  const adapter = nodeWebSocketAdapter({resolve: async (request) => (await app.fetch(request)).crossws ?? {}})
  server.node?.server?.on('upgrade', (request, socket, head) => adapter.handleUpgrade(request, socket, head))
  const base = new URL(server.url ?? '').origin
  return {
    base,
    wsBase: base.replace('http', 'ws'),
    sessions,
    close: async () => {
      await result?.dispose?.()
      await server.close(true)
    },
  }
}
