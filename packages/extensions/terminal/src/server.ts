import {randomUUID} from 'node:crypto'
import {HTTPException} from 'hono/http-exception'
import {streamSSE} from 'hono/streaming'
import {zValidator} from '@hono/zod-validator'
import {upgradeWebSocket} from '@hono/node-server'
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

export default defineExtension({name: TERMINAL_NAME}).server((server) => {
  const ttySessions = createTtySessions()
  server.sessions.onChatTurn((sessionId) => ttySessions.close(sessionId))

  const requireSession = (headers: Headers): string => {
    const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
    if (!raw) throw new HTTPException(400, {message: 'no session (resolve first)'})
    if (!isSessionId(raw)) throw new HTTPException(400, {message: 'invalid session id (must be ours)'})
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

  server.app.post('/open', zValidator('json', TerminalOpenRequestSchema), async (c) => {
    const sessionId = requireSession(c.req.raw.headers)
    const size = c.req.valid('json')
    const ttyCommand = server.harness.ttyCommand
    if (!ttyCommand) {
      throw new HTTPException(400, {message: `harness "${server.harness.id}" has no terminal mode`})
    }
    if (server.sessions.chatBusy(sessionId)) throw new HTTPException(409, {message: 'session busy'})
    if (reuseAlive(ttySessions.get(sessionId), size)) return c.json({alive: true})
    await openTtySession(sessionId, size, ttyCommand, new URL(c.req.url).origin)
    return c.json({alive: true})
  })

  server.app.post('/close', (c) => {
    const sessionId = requireSession(c.req.raw.headers)
    if (ttySessions.get(sessionId)?.busy()) throw new HTTPException(409, {message: 'terminal busy'})
    ttySessions.close(sessionId)
    return c.json({alive: false})
  })

  server.app.get('/state', (c) => {
    const sessionId = requireSession(c.req.raw.headers)
    const session = ttySessions.get(sessionId)
    const payload: TerminalState = {alive: Boolean(session) && !session?.exited(), busy: session?.busy() ?? false}
    return c.json(payload)
  })

  server.app.get('/mirror', async (c) => {
    const sessionId = requireSession(c.req.raw.headers)
    const token = await server.sessions.resumeToken(sessionId)
    const transcriptMessages = server.harness.transcriptMessages
    if (!token || !transcriptMessages) throw new HTTPException(404, {message: 'no transcript'})
    return streamSSE(c, async (stream) => {
      await new Promise<void>((resolve) => {
        const stop = watchMirror({messages: () => transcriptMessages(token)}, (payload) => {
          void stream.writeSSE({data: JSON.stringify(payload)})
        })
        stream.onAbort(() => {
          stop()
          resolve()
        })
      })
    })
  })

  server.app.get(
    '/tty',
    upgradeWebSocket((c) => {
      const url = new URL(c.req.url)
      const sessionOf = () => ttySessions.get(url.searchParams.get('session') ?? '')
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
