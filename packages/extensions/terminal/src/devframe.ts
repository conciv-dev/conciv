import {randomUUID} from 'node:crypto'
import {defineDevframe, defineRpcFunction} from 'devframe'
import type {DevframeNodeContext} from 'devframe/types'
import type {RpcDefinitionsToFunctions} from 'devframe/rpc'
import type {DevframeHubContext} from '@devframes/hub/types'
import {z} from 'zod'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {createTtySessions, type TtySessions} from './server/pty-sessions.js'
import {TERMINAL_DOCK_TYPE, TERMINAL_OUTPUT_CHANNEL, type TerminalFrame} from './shared/devframe-protocol.js'

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

type TerminalPlane = {tty: TtySessions; host: () => ConcivHost}

function isHubContext(ctx: DevframeNodeContext): ctx is DevframeHubContext {
  return 'docks' in ctx
}

async function resolveSession(plane: TerminalPlane, requested: SessionId | undefined): Promise<SessionId> {
  if (requested) return requested
  const latest = await plane.host().latestSession()
  if (!latest) throw new Error('CONCIV_NO_SESSION: start a conciv chat session first')
  return latest
}

async function ensureTty(plane: TerminalPlane, sessionId: SessionId, cols: number, rows: number): Promise<void> {
  const alive = plane.tty.get(sessionId)
  if (alive && !alive.exited()) {
    alive.resize(cols, rows)
    return
  }
  const host = plane.host()
  const ttyCommand = host.harness.ttyCommand
  if (!ttyCommand) throw new Error(`CONCIV_NO_TTY: harness "${host.harness.id}" has no terminal mode`)
  const token = (await host.sessions.resumeToken(sessionId)) ?? HarnessSessionId.parse(randomUUID())
  await host.sessions.recordToken(sessionId, token)
  const resume = host.harness.transcriptExists?.(token) ?? true
  host.harness.release?.(sessionId)
  const session = plane.tty.open(
    sessionId,
    ttyCommand({
      cwd: host.cwd,
      stateDir: host.stateDir,
      concivSessionId: sessionId,
      harnessSessionId: token,
      resume,
      owned: true,
      model: await host.sessions.model(sessionId),
      mcpUrl: null,
      hookUrl: null,
    }),
    host.cwd,
  )
  session.resize(cols, rows)
}

function terminalFunctions(plane: TerminalPlane, ctx: DevframeNodeContext) {
  const output = ctx.rpc.streaming.create<TerminalFrame>(TERMINAL_OUTPUT_CHANNEL, {replayWindow: 4096})

  const open = defineRpcFunction({
    name: 'conciv-terminal:open',
    type: 'action',
    jsonSerializable: true,
    args: [OpenInput],
    returns: z.object({sessionId: z.string(), streamId: z.string()}),
    handler: async (raw) => {
      const input = OpenInput.parse(raw)
      const sessionId = await resolveSession(plane, input.sessionId)
      await ensureTty(plane, sessionId, input.cols, input.rows)
      const session = plane.tty.get(sessionId)
      if (!session) throw new Error('CONCIV_NO_TTY: terminal did not start')
      const stream = output.start()
      const detach = session.attach({
        data: (data) => stream.write({kind: 'data', data}),
        control: (control) => stream.write({kind: 'control', control}),
      })
      stream.signal.addEventListener('abort', detach, {once: true})
      return {sessionId, streamId: stream.id}
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
      plane.tty.get(input.sessionId)?.write(input.data)
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
      plane.tty.get(input.sessionId)?.resize(input.cols, input.rows)
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
      const hostRef: {current: ConcivHost | null} = {current: null}
      const plane: TerminalPlane = {
        tty: createTtySessions(),
        host: () => {
          if (!hostRef.current) throw new Error('CONCIV_NO_HOST: the conciv engine is not attached')
          return hostRef.current
        },
      }
      ctx.services.whenAvailable(CONCIV_HOST_SERVICE, (host) => {
        hostRef.current = host
      })
      terminalFunctions(plane, ctx).forEach((fn) => ctx.rpc.register(fn))
      if (isHubContext(ctx))
        ctx.docks.register({
          id: 'conciv-terminal-view',
          title: 'Agent terminal',
          icon: 'ph:terminal-window-duotone',
          type: TERMINAL_DOCK_TYPE,
        })
    },
  })
}
