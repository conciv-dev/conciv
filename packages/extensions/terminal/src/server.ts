import {randomUUID} from 'node:crypto'
import {HTTPError, defineWebSocketHandler, readValidatedBody} from 'h3'
import type {Peer} from 'crossws'
import {defineExtension} from '@conciv/extension'
import {CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'
import {TtyClientControlSchema} from '@conciv/protocol/terminal-types'
import {createTtySessions, type TtySink} from './server/pty-sessions.js'
import {TERMINAL_NAME, TerminalOpenRequestSchema, type TerminalState} from './shared/protocol.js'

export default defineExtension({name: TERMINAL_NAME}).server((server) => {
  const ttySessions = createTtySessions()

  const requireSession = (headers: Headers): string => {
    const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
    if (!raw) throw new HTTPError({status: 400, message: 'no session (resolve first)'})
    if (!isSessionId(raw)) throw new HTTPError({status: 400, message: 'invalid session id (must be ours)'})
    return raw
  }

  server.app.post('/open', async (event) => {
    const sessionId = requireSession(event.req.headers)
    const size = await readValidatedBody(event, TerminalOpenRequestSchema)
    const ttyCommand = server.harness.ttyCommand
    if (!ttyCommand) {
      throw new HTTPError({status: 400, message: `harness "${server.harness.id}" has no terminal mode`})
    }
    if (server.sessions.chatBusy(sessionId)) throw new HTTPError({status: 409, message: 'session busy'})
    const existing = await server.sessions.resumeToken(sessionId)
    const harnessSessionId = existing ?? randomUUID()
    if (!existing) await server.sessions.recordToken(sessionId, harnessSessionId)
    const model = await server.sessions.model(sessionId)
    const resume = Boolean(existing) && (server.harness.transcriptExists?.(harnessSessionId) ?? true)
    server.harness.release?.(sessionId)
    const session = ttySessions.open(sessionId, ttyCommand({cwd: server.cwd, harnessSessionId, resume, model}), server.cwd)
    if (size.cols && size.rows) session.resize(size.cols, size.rows)
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

  const detachments = new WeakMap<Peer, () => void>()

  server.app.get(
    '/tty',
    defineWebSocketHandler({
      open(peer) {
        const url = new URL(peer.request?.url ?? 'http://localhost/tty')
        const sessionId = url.searchParams.get('session') ?? ''
        const session = ttySessions.get(sessionId)
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
        const url = new URL(peer.request?.url ?? 'http://localhost/tty')
        const sessionId = url.searchParams.get('session') ?? ''
        const session = ttySessions.get(sessionId)
        if (!session) return
        const text = message.text()
        const control = parseControl(text)
        if (control) {
          session.resize(control.cols, control.rows)
          return
        }
        session.write(text)
      },
      close(peer) {
        detachments.get(peer)?.()
        detachments.delete(peer)
      },
    }),
  )

  return {context: {}, dispose: () => ttySessions.shutdown()}
})

function parseControl(text: string): {cols: number; rows: number} | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = TtyClientControlSchema.safeParse(JSON.parse(text))
    return parsed.success ? {cols: parsed.data.cols, rows: parsed.data.rows} : null
  } catch {
    return null
  }
}
