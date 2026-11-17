import {Hono} from 'hono'
import {z} from 'zod'
import type {UpgradeWebSocket} from '@conciv/extension/rpc-mount'
import {TtyClientControlSchema, type TtyClientControl} from '@conciv/protocol/terminal-types'
import type {PersistentPtys} from '../pty/persistent-ptys.js'
import type {TtySession, TtySink} from '../pty/pty-sessions.js'

export const PERSISTENT_PTY_CONNECT_PATH = '/api/experimental/persistent-pty/:ptyId/connect'

const PTY_GONE_CLOSE_CODE = 4404

const ESCAPE_KEY = String.fromCharCode(27)

const ConnectParamsSchema = z.object({ptyId: z.string().min(1).max(64)})

const ConnectQuerySchema = z.object({
  ticket: z.string().min(1).max(128),
  cols: z.coerce.number().int().min(2).max(500).optional().catch(undefined),
  rows: z.coerce.number().int().min(2).max(500).optional().catch(undefined),
})

function parseControl(text: string): TtyClientControl | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = TtyClientControlSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
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

export function persistentPtySocketRoutes(ptys: PersistentPtys, upgrade: UpgradeWebSocket) {
  return new Hono().get(
    PERSISTENT_PTY_CONNECT_PATH,
    async (c, next) => {
      const params = ConnectParamsSchema.safeParse(c.req.param())
      const query = ConnectQuerySchema.safeParse(c.req.query())
      if (!params.success || !query.success) return c.text('forbidden', 403)
      if (!ptys.consumeTicket(query.data.ticket, params.data.ptyId)) return c.text('forbidden', 403)
      await next()
    },
    upgrade((c) => {
      const ptyId = c.req.param('ptyId') ?? ''
      const query = ConnectQuerySchema.parse(c.req.query())
      const held: {detach: (() => void) | null} = {detach: null}
      return {
        onOpen(_event, socket) {
          const session = ptys.find(ptyId)
          if (session === undefined) {
            socket.close(PTY_GONE_CLOSE_CODE, 'no terminal with that id')
            return
          }
          if (query.cols !== undefined && query.rows !== undefined) session.resize(query.cols, query.rows)
          const sink: TtySink = {
            data: (chunk) => socket.send(Buffer.from(chunk)),
            control: (frame) => socket.send(JSON.stringify(frame)),
          }
          held.detach = session.attach(sink)
        },
        onMessage(event) {
          const session = ptys.find(ptyId)
          if (session === undefined) return
          const text = typeof event.data === 'string' ? event.data : ''
          if (text && !applyControl(session, parseControl(text), text)) session.write(text)
        },
        onClose() {
          held.detach?.()
          held.detach = null
        },
      }
    }),
  )
}
