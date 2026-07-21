import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {upgradeWebSocket} from '@hono/node-server'
import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator, type ServerApi} from '@conciv/extension'
import {isSessionId, type UIMessage} from '@conciv/protocol/chat-types'
import {TtyClientControlSchema, type TtyClientControl} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySession, type TtySink} from './server/pty-sessions.js'
import {watchMirror} from './server/mirror.js'
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

async function resolveHarnessSession(
  {server}: TerminalRuntime,
  sessionId: string,
): Promise<{harnessSessionId: string; resume: boolean}> {
  const existing = await server.sessions.resumeToken(sessionId)
  const harnessSessionId = existing ?? randomUUID()
  if (!existing) await server.sessions.recordToken(sessionId, harnessSessionId)
  const resume = Boolean(existing) && (server.harness.transcriptExists?.(harnessSessionId) ?? true)
  return {harnessSessionId, resume}
}

async function openTtySession(
  runtime: TerminalRuntime,
  sessionId: string,
  size: TerminalOpenRequest,
  origin: string,
): Promise<void> {
  const {server, tty} = runtime
  const ttyCommand = server.harness.ttyCommand
  if (!ttyCommand) throw new Error(`harness "${server.harness.id}" has no terminal mode`)
  const {harnessSessionId, resume} = await resolveHarnessSession(runtime, sessionId)
  const model = size.model ?? (await server.sessions.model(sessionId))
  server.harness.release?.(sessionId)
  const mcpUrl = `${origin}/api/mcp`
  const session = tty.open(
    sessionId,
    ttyCommand({cwd: server.cwd, harnessSessionId, resume, model, mcpUrl, concivSessionId: sessionId}),
    server.cwd,
  )
  if (size.cols && size.rows) session.resize(size.cols, size.rows)
  if (resume) session.inject('\u001b[2m\u2500 conciv: resumed session \u2500\u001b[0m')
}

const terminalOs = os.$context<{request: Request}>()

const SessionInputSchema = z.object({sessionId: z.string().refine(isSessionId, 'invalid session id (must be ours)')})

const noTty = {NO_TTY: {message: 'harness has no terminal mode'}}
const busy = {BUSY: {message: 'session busy'}}

function makeTerminalRouter(runtime: TerminalRuntime) {
  return terminalOs.router({
    open: terminalOs
      .errors({...noTty, ...busy})
      .input(TerminalOpenRequestSchema.extend(SessionInputSchema.shape))
      .output(z.object({alive: z.boolean()}))
      .handler(async ({input, context, errors}) => {
        const {server, tty} = runtime
        const {sessionId, ...size} = input
        if (!server.harness.ttyCommand) throw errors.NO_TTY()
        if (server.sessions.chatBusy(sessionId)) throw errors.BUSY()
        if (reuseAlive(tty.get(sessionId), size)) return {alive: true}
        await openTtySession(runtime, sessionId, size, new URL(context.request.url).origin)
        return {alive: true}
      }),
    close: terminalOs
      .errors(busy)
      .input(SessionInputSchema)
      .output(z.object({alive: z.boolean()}))
      .handler(({input, errors}) => {
        const {tty} = runtime
        if (tty.get(input.sessionId)?.busy()) throw errors.BUSY()
        tty.close(input.sessionId)
        return {alive: false}
      }),
    state: terminalOs
      .input(SessionInputSchema)
      .output(TerminalStateSchema)
      .handler(({input}) => {
        const session = runtime.tty.get(input.sessionId)
        const payload: TerminalState = {alive: Boolean(session) && !session?.exited(), busy: session?.busy() ?? false}
        return payload
      }),
    mirror: terminalOs
      .errors({NO_TRANSCRIPT: {message: 'no transcript'}})
      .input(SessionInputSchema)
      .output(eventIterator(z.object({messages: z.array(z.custom<UIMessage>())})))
      .handler(async function* ({input, signal, errors}) {
        const {server} = runtime
        const token = await server.sessions.resumeToken(input.sessionId)
        const transcriptMessages = server.harness.transcriptMessages
        if (!token || !transcriptMessages) throw errors.NO_TRANSCRIPT()
        yield* subscriptionIterator<{messages: UIMessage[]}>(
          (emit) => watchMirror({messages: () => transcriptMessages(token)}, emit),
          signal,
        )
      }),
  })
}

export type TerminalRouter = ReturnType<typeof makeTerminalRouter>

const app = new Hono<TerminalEnv>().get(
  '/tty',
  upgradeWebSocket((c) => {
    const {tty} = c.var.terminal
    const url = new URL(c.req.url)
    const sessionOf = () => tty.get(url.searchParams.get('session') ?? '')
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

export type TerminalAppType = typeof app

export default defineExtension({name: TERMINAL_NAME}).server((server) => {
  const tty = createTtySessions()
  server.sessions.onChatTurn((sessionId) => tty.close(sessionId))
  const runtime: TerminalRuntime = {server, tty}
  return {
    context: {},
    router: makeTerminalRouter(runtime),
    app: new Hono<TerminalEnv>()
      .use(async (c, next) => {
        c.set('terminal', runtime)
        await next()
      })
      .route('/', app),
    dispose: () => tty.shutdown(),
  }
})

function parseControl(text: string): TtyClientControl | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = TtyClientControlSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
