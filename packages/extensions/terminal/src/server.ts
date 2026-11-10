import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, type ServerApi, type ServerHarness} from '@conciv/extension'
import type {UpgradeWebSocket} from '@conciv/extension/rpc-mount'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {TtyClientControlSchema, type TtyClientControl} from '@conciv/protocol/terminal-types'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {createTtySessions, type TtySession, type TtySink} from './server/pty-sessions.js'
import {
  TERMINAL_NAME,
  TerminalOpenRequestSchema,
  TerminalStateSchema,
  type TerminalOpenRequest,
  type TerminalState,
} from './shared/protocol.js'

const ESCAPE_KEY = String.fromCharCode(27)

type TerminalRuntime = {
  server: ServerApi<Record<never, never>>
  tty: ReturnType<typeof createTtySessions>
}

type TerminalEnv = {Variables: {terminal: TerminalRuntime}}

function reuseAlive(alive: TtySession | undefined, size: TerminalOpenRequest): boolean {
  if (!alive || alive.exited()) return false
  if (size.cols && size.rows) alive.resize(size.cols, size.rows)
  return true
}

function applyControl(session: TtySession, control: TtyClientControl | null, text: string): boolean {
  if (control?.type === 'resize') {
    session.resize(control.cols, control.rows)
    return true
  }
  if (control?.type === 'inject') {
    session.inject(control.text)
    return true
  }
  if (text === ESCAPE_KEY && session.busy()) {
    session.interrupt()
    return true
  }
  return false
}

function resumable(harness: ServerHarness, harnessSessionId: HarnessSessionId | null): boolean {
  if (!harnessSessionId) return false
  return harness.transcriptExists?.(harnessSessionId) ?? true
}

function ttyOwner(harnessId: string, harnessSessionId: HarnessSessionId | null): string {
  return `${harnessId}:${harnessSessionId ?? ''}`
}

async function liveTty({server, tty}: TerminalRuntime, sessionId: SessionId): Promise<TtySession | undefined> {
  const owner = ttyOwner(server.harness(sessionId).id, await server.sessions.resumeToken(sessionId))
  const alive = tty.get(sessionId)
  if (alive === undefined || alive.owner === owner) return alive
  tty.close(sessionId)
  return undefined
}

function apiBase(runtime: TerminalRuntime, context: RpcContext): string {
  return `${context.origin}${runtime.server.basePath}`
}

async function connectContext(
  runtime: TerminalRuntime,
  sessionId: SessionId,
  harnessSessionId: HarnessSessionId | null,
  model: string | null,
  base: string,
): Promise<HarnessConnectContext> {
  const {server} = runtime
  return {
    cwd: server.cwd,
    stateDir: server.stateDir,
    concivSessionId: sessionId,
    harnessSessionId,
    resume: resumable(server.harness(sessionId), harnessSessionId),
    owned: true,
    model: model ?? (await server.sessions.model(sessionId)),
    mcpUrl: `${base}/api/mcp`,
    hookUrl: null,
  }
}

async function mintHarnessSession(runtime: TerminalRuntime, sessionId: SessionId): Promise<HarnessSessionId> {
  const existing = await runtime.server.sessions.resumeToken(sessionId)
  if (existing) return existing
  const minted = HarnessSessionId.parse(randomUUID())
  await runtime.server.sessions.recordToken(sessionId, minted)
  return minted
}

async function openTtySession(
  runtime: TerminalRuntime,
  sessionId: SessionId,
  size: TerminalOpenRequest,
  base: string,
): Promise<void> {
  const {server, tty} = runtime
  const harness = server.harness(sessionId)
  const ttyCommand = harness.ttyCommand
  if (!ttyCommand) throw new Error(`harness "${harness.id}" has no terminal mode`)
  const harnessSessionId = await mintHarnessSession(runtime, sessionId)
  const ctx = await connectContext(runtime, sessionId, harnessSessionId, size.model ?? null, base)
  harness.release?.(sessionId)
  const session = tty.open(sessionId, ttyCommand(ctx), server.cwd, ttyOwner(harness.id, harnessSessionId))
  if (size.cols && size.rows) session.resize(size.cols, size.rows)
  if (ctx.resume) session.inject('\u001b[2m\u2500 conciv: resumed session \u2500\u001b[0m')
}

const terminalOs = os.$context<RpcContext>()

const SessionInputSchema = z.object({sessionId: SessionId})

const noTty = {NO_TTY: {message: 'harness has no terminal mode'}}
const busy = {BUSY: {message: 'session busy'}}

function makeTerminalRouter(runtime: TerminalRuntime) {
  return terminalOs.router({
    open: terminalOs
      .errors({...noTty, ...busy})
      .input(TerminalOpenRequestSchema.extend(SessionInputSchema.shape))
      .output(z.object({alive: z.boolean()}))
      .handler(async ({input, context, errors}) => {
        const {sessionId, ...size} = input
        if (!runtime.server.harness(sessionId).ttyCommand) throw errors.NO_TTY()
        if (reuseAlive(await liveTty(runtime, sessionId), size)) return {alive: true}
        await openTtySession(runtime, sessionId, size, apiBase(runtime, context))
        return {alive: true}
      }),
    close: terminalOs
      .errors(busy)
      .input(SessionInputSchema)
      .output(z.object({alive: z.boolean()}))
      .handler(async ({input, errors}) => {
        if ((await liveTty(runtime, input.sessionId))?.busy()) throw errors.BUSY()
        runtime.tty.close(input.sessionId)
        return {alive: false}
      }),
    state: terminalOs
      .input(SessionInputSchema)
      .output(TerminalStateSchema)
      .handler(async ({input}) => {
        const session = await liveTty(runtime, input.sessionId)
        const payload: TerminalState = {alive: Boolean(session) && !session?.exited(), busy: session?.busy() ?? false}
        return payload
      }),
  })
}

export type TerminalRouter = ReturnType<typeof makeTerminalRouter>

function ttyApp(upgradeWebSocket: UpgradeWebSocket) {
  return new Hono<TerminalEnv>().get(
    '/tty',
    async (c, next) => {
      const parsed = SessionId.safeParse(c.req.query('session'))
      if (!parsed.success) return c.text('invalid or missing session', 400)
      await next()
    },
    upgradeWebSocket((c) => {
      const {tty} = c.var.terminal
      const url = new URL(c.req.url)
      const sessionOf = () => {
        const parsed = SessionId.safeParse(url.searchParams.get('session'))
        return parsed.success ? tty.get(parsed.data) : undefined
      }
      let detach: (() => void) | null = null
      return {
        onOpen(_event, ws) {
          const session = sessionOf()
          if (!session) {
            ws.close(4404, 'no terminal for session')
            return
          }
          const cols = Number(url.searchParams.get('cols'))
          const rows = Number(url.searchParams.get('rows'))
          if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 1 && rows > 1) session.resize(cols, rows)
          const sink: TtySink = {
            data: (chunk) => ws.send(Buffer.from(chunk)),
            control: (frame) => ws.send(JSON.stringify(frame)),
          }
          detach = session.attach(sink)
        },
        onMessage(event) {
          const session = sessionOf()
          if (!session) return
          const text = typeof event.data === 'string' ? event.data : ''
          if (text && !applyControl(session, parseControl(text), text)) session.write(text)
        },
        onClose() {
          detach?.()
          detach = null
        },
      }
    }),
  )
}

export type TerminalAppType = ReturnType<typeof ttyApp>

export function createTerminalExtension() {
  return defineExtension({name: TERMINAL_NAME}).server((server) => {
    const tty = createTtySessions()
    const runtime: TerminalRuntime = {server, tty}
    return {
      context: {},
      router: makeTerminalRouter(runtime),
      app: new Hono<TerminalEnv>()
        .use(async (c, next) => {
          c.set('terminal', runtime)
          await next()
        })
        .route('/', ttyApp(server.upgradeWebSocket)),
      dispose: () => tty.shutdown(),
    }
  })
}

export default createTerminalExtension()

function parseControl(text: string): TtyClientControl | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = TtyClientControlSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
