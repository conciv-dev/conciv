import {randomUUID} from 'node:crypto'
import {HTTPError, defineWebSocketHandler, readValidatedBody} from 'h3'
import type {Peer} from 'crossws'
import {defineExtension} from '@conciv/extension'
import {CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'
import {TtyClientControlSchema, type TtyClientControl} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySession, type TtySink} from './server/pty-sessions.js'
import {watchMirror} from './server/mirror.js'
import {
  TERMINAL_NAME,
  TerminalOpenRequestSchema,
  type TerminalOpenRequest,
  type TerminalState,
} from './shared/protocol.js'

const ESCAPE_KEY = String.fromCharCode(27)

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

function sessionFromPeer(peer: Peer, ttySessions: ReturnType<typeof createTtySessions>): TtySession | undefined {
  const url = new URL(peer.request?.url ?? 'http://localhost/tty')
  return ttySessions.get(url.searchParams.get('session') ?? '')
}

export default defineExtension({name: TERMINAL_NAME}).server((server) => {
  const ttySessions = createTtySessions()
  server.sessions.onChatTurn((sessionId) => ttySessions.close(sessionId))

  const requireSession = (headers: Headers): string => {
    const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
    if (!raw) throw new HTTPError({status: 400, message: 'no session (resolve first)'})
    if (!isSessionId(raw)) throw new HTTPError({status: 400, message: 'invalid session id (must be ours)'})
    return raw
  }

  const resolveHarnessSession = async (sessionId: string): Promise<{harnessSessionId: string; resume: boolean}> => {
    const existing = await server.sessions.resumeToken(sessionId)
    const harnessSessionId = existing ?? randomUUID()
    if (!existing) await server.sessions.recordToken(sessionId, harnessSessionId)
    const resume = Boolean(existing) && (server.harness.transcriptExists?.(harnessSessionId) ?? true)
    return {harnessSessionId, resume}
  }

  const openTtySession = async (
    sessionId: string,
    size: TerminalOpenRequest,
    ttyCommand: NonNullable<typeof server.harness.ttyCommand>,
    origin: string,
  ): Promise<void> => {
    const {harnessSessionId, resume} = await resolveHarnessSession(sessionId)
    const model = size.model ?? (await server.sessions.model(sessionId))
    server.harness.release?.(sessionId)
    const mcpUrl = `${origin}/api/mcp`
    const session = ttySessions.open(
      sessionId,
      ttyCommand({cwd: server.cwd, harnessSessionId, resume, model, mcpUrl, concivSessionId: sessionId}),
      server.cwd,
    )
    if (size.cols && size.rows) session.resize(size.cols, size.rows)
    if (resume) session.inject('\u001b[2m— conciv: resumed session —\u001b[0m')
  }

  server.app.post('/open', async (event) => {
    const sessionId = requireSession(event.req.headers)
    const size = await readValidatedBody(event, TerminalOpenRequestSchema)
    const ttyCommand = server.harness.ttyCommand
    if (!ttyCommand) {
      throw new HTTPError({status: 400, message: `harness "${server.harness.id}" has no terminal mode`})
    }
    if (server.sessions.chatBusy(sessionId)) throw new HTTPError({status: 409, message: 'session busy'})
    if (reuseAlive(ttySessions.get(sessionId), size)) return {alive: true}
    await openTtySession(sessionId, size, ttyCommand, new URL(event.req.url).origin)
    return {alive: true}
  })

  server.app.post('/close', (event) => {
    const sessionId = requireSession(event.req.headers)
    if (ttySessions.get(sessionId)?.busy()) throw new HTTPError({status: 409, message: 'terminal busy'})
    ttySessions.close(sessionId)
    return {alive: false}
  })

  server.app.get('/state', (event): TerminalState => {
    const sessionId = requireSession(event.req.headers)
    const session = ttySessions.get(sessionId)
    return {alive: Boolean(session) && !session?.exited(), busy: session?.busy() ?? false}
  })

  server.app.get('/mirror', async (event) => {
    const sessionId = requireSession(event.req.headers)
    const token = await server.sessions.resumeToken(sessionId)
    const transcriptMessages = server.harness.transcriptMessages
    if (!token || !transcriptMessages) throw new HTTPError({status: 404, message: 'no transcript'})
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = watchMirror({messages: () => transcriptMessages(token)}, (payload) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
          } catch {
            stop()
          }
        })
        event.req.signal.addEventListener('abort', stop)
      },
    })
    return new Response(stream, {
      status: 200,
      headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'},
    })
  })

  const detachments = new WeakMap<Peer, () => void>()

  server.app.get(
    '/tty',
    defineWebSocketHandler({
      open(peer) {
        const url = new URL(peer.request?.url ?? 'http://localhost/tty')
        const session = ttySessions.get(url.searchParams.get('session') ?? '')
        if (!session) {
          peer.close(4404, 'no terminal for session')
          return
        }
        const cols = Number(url.searchParams.get('cols'))
        const rows = Number(url.searchParams.get('rows'))
        if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 1 && rows > 1) session.resize(cols, rows)
        const sink: TtySink = {
          data: (chunk) => peer.send(Buffer.from(chunk)),
          control: (frame) => peer.send(JSON.stringify(frame)),
        }
        detachments.set(peer, session.attach(sink))
      },
      message(peer, message) {
        const session = sessionFromPeer(peer, ttySessions)
        if (!session) return
        const text = message.text()
        if (!applyControl(session, parseControl(text), text)) session.write(text)
      },
      close(peer) {
        detachments.get(peer)?.()
        detachments.delete(peer)
      },
    }),
  )

  return {context: {}, dispose: () => ttySessions.shutdown()}
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
