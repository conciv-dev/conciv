import {Hono} from 'hono'
import {serveApp} from '@conciv/harness-testkit'
import type {ServerApi, ServerHarness, ServerSessions} from '@conciv/extension'
import type {TtyCommandOpts} from '@conciv/protocol/terminal-types'
import terminalExtension from '../src/server.js'

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
  const app = new Hono()
  const sessions = fakeSessions()
  const api: ServerApi<Record<never, never>> = {
    config: {},
    cwd: process.cwd(),
    sessions,
    harness,
    approvals: {request: async () => false},
  }
  const result = await terminalExtension.__server?.(api)
  if (!(result?.app instanceof Hono)) throw new Error('terminal extension returned no hono app')
  app.route('/api/ext/terminal', result.app)
  const served = await serveApp(app.fetch)
  return {
    base: served.base,
    wsBase: served.wsBase,
    sessions,
    close: async () => {
      await result?.dispose?.()
      await served.close()
    },
  }
}
