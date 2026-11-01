import {randomUUID} from 'node:crypto'
import {defineDevframe, defineRpcFunction} from 'devframe'
import type {DevframeNodeContext} from 'devframe/types'
import type {RpcDefinitionsToFunctions} from 'devframe/rpc'
import type {DevframeHubContext, DevframePtyTerminalSession} from '@devframes/hub/types'
import {z} from 'zod'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {TERMINAL_DOCK_TYPE} from './shared/devframe-protocol.js'

const OpenInput = z.object({
  sessionId: SessionId.optional(),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(500),
})
const InputInput = z.object({sessionId: SessionId, data: z.string().max(65_536)})
const ResizeInput = z.object({
  sessionId: SessionId,
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(500),
})

type TerminalPlane = {
  sessions: Map<SessionId, DevframePtyTerminalSession>
  host: () => ConcivHost
  hub: () => DevframeHubContext
}

function isHubContext(ctx: DevframeNodeContext): ctx is DevframeHubContext {
  return 'docks' in ctx
}

async function resolveSession(plane: TerminalPlane, requested: SessionId | undefined): Promise<SessionId> {
  if (requested) return requested
  const latest = await plane.host().latestSession()
  if (!latest) throw new Error('CONCIV_NO_SESSION: start a conciv chat session first')
  return latest
}

function withUnsetEnv(command: TtyCommand): {command: string; args: string[]} {
  const prefixes = command.unsetEnvPrefixes ?? []
  const unset = Object.keys(process.env).filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
  if (unset.length === 0) return {command: command.bin, args: command.args}
  return {command: '/usr/bin/env', args: [...unset.flatMap((key) => ['-u', key]), command.bin, ...command.args]}
}

async function ensurePty(plane: TerminalPlane, sessionId: SessionId, cols: number, rows: number): Promise<string> {
  const alive = plane.sessions.get(sessionId)
  if (alive && alive.status === 'running') {
    alive.resize(cols, rows)
    return alive.id
  }
  if (alive) plane.hub().terminals.remove(alive)
  const host = plane.host()
  const ttyCommand = host.harness.ttyCommand
  if (!ttyCommand) throw new Error(`CONCIV_NO_TTY: harness "${host.harness.id}" has no terminal mode`)
  const token = (await host.sessions.resumeToken(sessionId)) ?? HarnessSessionId.parse(randomUUID())
  await host.sessions.recordToken(sessionId, token)
  const resume = host.harness.transcriptExists?.(token) ?? true
  host.harness.release?.(sessionId)
  const tty = ttyCommand({
    cwd: host.cwd,
    stateDir: host.stateDir,
    concivSessionId: sessionId,
    harnessSessionId: token,
    resume,
    owned: true,
    model: await host.sessions.model(sessionId),
    mcpUrl: null,
    hookUrl: null,
  })
  const session = await plane
    .hub()
    .terminals.startPtySession(
      {...withUnsetEnv(tty), env: tty.env, cwd: host.cwd, cols, rows},
      {id: `conciv-agent-${sessionId}-${Date.now()}`, title: 'conciv agent', description: `chat session ${sessionId}`},
    )
  plane.sessions.set(sessionId, session)
  return session.id
}

function terminalFunctions(plane: TerminalPlane) {
  const open = defineRpcFunction({
    name: 'conciv-terminal:open',
    type: 'action',
    jsonSerializable: true,
    args: [OpenInput],
    returns: z.object({sessionId: z.string(), streamId: z.string()}),
    handler: async (raw) => {
      const input = OpenInput.parse(raw)
      const sessionId = await resolveSession(plane, input.sessionId)
      const streamId = await ensurePty(plane, sessionId, input.cols, input.rows)
      return {sessionId, streamId}
    },
  })

  const write = defineRpcFunction({
    name: 'conciv-terminal:write',
    type: 'action',
    jsonSerializable: true,
    args: [InputInput],
    returns: z.null(),
    handler: (raw) => {
      const input = InputInput.parse(raw)
      plane.sessions.get(input.sessionId)?.write(input.data)
      return null
    },
  })

  const resize = defineRpcFunction({
    name: 'conciv-terminal:resize',
    type: 'action',
    jsonSerializable: true,
    args: [ResizeInput],
    returns: z.null(),
    handler: (raw) => {
      const input = ResizeInput.parse(raw)
      plane.sessions.get(input.sessionId)?.resize(input.cols, input.rows)
      return null
    },
  })

  return [open, write, resize] as const
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<ReturnType<typeof terminalFunctions>> {}
}

export function createTerminalDevframe() {
  return defineDevframe({
    id: 'conciv-terminal',
    name: 'Terminal',
    version: '0.0.0',
    packageName: '@conciv/extension-terminal',
    homepage: 'https://conciv.dev',
    description: 'The conciv agent session in a terminal.',
    icon: 'ph:terminal-window-duotone',
    dock: {when: 'false'},
    setup(ctx) {
      if (!isHubContext(ctx)) return
      const hub = ctx
      const hostRef: {current: ConcivHost | null} = {current: null}
      const plane: TerminalPlane = {
        sessions: new Map(),
        hub: () => hub,
        host: () => {
          if (!hostRef.current) throw new Error('CONCIV_NO_HOST: the conciv engine is not attached')
          return hostRef.current
        },
      }
      ctx.services.whenAvailable(CONCIV_HOST_SERVICE, (host) => {
        hostRef.current = host
      })
      terminalFunctions(plane).forEach((fn) => ctx.rpc.register(fn))
      ctx.docks.register({
        id: 'conciv-terminal-view',
        title: 'Agent terminal',
        icon: 'ph:terminal-window-duotone',
        type: TERMINAL_DOCK_TYPE,
      })
    },
  })
}
