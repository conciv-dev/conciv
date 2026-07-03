import {randomUUID} from 'node:crypto'
import {type H3, HTTPError, defineWebSocketHandler, readValidatedBody} from 'h3'
import type {Peer} from 'crossws'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {SetModeRequestSchema, TtyClientControlSchema, type SessionMode} from '@conciv/protocol/terminal-types'
import type {SessionStore} from '../../store/session-store.js'
import {readLock} from '../../store/lock.js'
import {sessionIdFromHeaders} from '../chat/session-id.js'
import {ensureChatRecord, recordMintedToken, resumeTokenFor} from '../chat/turn.js'
import {createTtySessions, type TtySink} from './pty-sessions.js'

export type TtyRouteDeps = {
  cwd: string
  stateRoot: string
  harness: Pick<HarnessAdapter, 'id' | 'tty' | 'release'>
  store: SessionStore
}

export function registerTtyRoutes(app: H3, deps: TtyRouteDeps): {dispose(): void} {
  const ttySessions = createTtySessions()
  const modes = new Map<string, SessionMode>()

  const requireSession = (headers: Headers): string => {
    const sessionId = sessionIdFromHeaders(headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session (resolve first)'})
    return sessionId
  }

  app.get('/api/chat/mode', (event) => ({mode: modes.get(requireSession(event.req.headers)) ?? 'chat'}))

  app.post('/api/chat/mode', async (event) => {
    const sessionId = requireSession(event.req.headers)
    const {mode} = await readValidatedBody(event, SetModeRequestSchema)

    if (mode === 'terminal') {
      const tty = deps.harness.tty
      if (!tty) throw new HTTPError({status: 400, message: `harness "${deps.harness.id}" has no terminal mode`})
      if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'session busy'})
      await ensureChatRecord(deps.store, sessionId, deps.harness.id, deps.cwd)
      const existing = await resumeTokenFor(deps.store, sessionId)
      const harnessSessionId = existing ?? randomUUID()
      if (!existing) await recordMintedToken(deps.store, sessionId, harnessSessionId)
      const record = await deps.store.get(sessionId)
      deps.harness.release?.(sessionId)
      ttySessions.open(
        sessionId,
        tty.command({cwd: deps.cwd, harnessSessionId, resume: Boolean(existing), model: record?.model}),
        deps.cwd,
      )
      modes.set(sessionId, 'terminal')
      return {mode}
    }

    if (ttySessions.get(sessionId)?.busy()) throw new HTTPError({status: 409, message: 'terminal busy'})
    ttySessions.close(sessionId)
    modes.set(sessionId, 'chat')
    return {mode}
  })

  const detachments = new WeakMap<Peer, () => void>()

  app.get(
    '/api/tty',
    defineWebSocketHandler({
      open(peer) {
        const url = new URL(peer.request?.url ?? 'http://localhost/api/tty')
        const sessionId = url.searchParams.get('session') ?? ''
        const session = modes.get(sessionId) === 'terminal' ? ttySessions.get(sessionId) : undefined
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
        const url = new URL(peer.request?.url ?? 'http://localhost/api/tty')
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

  return {dispose: () => ttySessions.shutdown()}
}

function parseControl(text: string): {cols: number; rows: number} | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = TtyClientControlSchema.safeParse(JSON.parse(text))
    return parsed.success ? {cols: parsed.data.cols, rows: parsed.data.rows} : null
  } catch {
    return null
  }
}
