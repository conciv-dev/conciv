import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {streamSSE} from 'hono/streaming'
import {zValidator} from '@hono/zod-validator'
import {eq} from 'drizzle-orm'
import {z} from 'zod'
import {commentRow, cursorEvent, elementRow, pendingRow, pinRow, readRow, replyRow} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store} from './db/store.js'

export type WhiteboardEnv = {Variables: {whiteboard: {store: Store}}}

const roomQuery = z.object({room: z.string().min(1)})
const scopeParam = z.object({scope: z.enum(['live', 'draft'])})
const bulkBody = z.object({rows: z.array(elementRow)})
const bulkDeleteBody = z.object({room: z.string(), elementIds: z.array(z.string())})

const found = <Row>(row: Row | undefined): Row => {
  if (!row) throw new HTTPException(404, {message: 'row not found'})
  return row
}

export const whiteboardApp = new Hono<WhiteboardEnv>()
  .get('/comments', zValidator('query', roomQuery), async (c) =>
    c.json(
      await c.var.whiteboard.store.db
        .select()
        .from(comments)
        .where(eq(comments.sessionId, c.req.valid('query').room)),
    ),
  )
  .post('/comments', zValidator('json', commentRow), async (c) =>
    c.json(await c.var.whiteboard.store.insertComment(c.req.valid('json'))),
  )
  .put('/comments/:id', zValidator('json', commentRow.partial()), async (c) =>
    c.json(found(await c.var.whiteboard.store.updateComment(c.req.param('id'), c.req.valid('json')))),
  )
  .delete('/comments/:id', async (c) =>
    c.json({deleted: await c.var.whiteboard.store.deleteComment(c.req.param('id'))}),
  )

  .get('/pins', zValidator('query', roomQuery), async (c) =>
    c.json(
      await c.var.whiteboard.store.db
        .select()
        .from(pins)
        .where(eq(pins.room, c.req.valid('query').room)),
    ),
  )
  .post('/pins', zValidator('json', pinRow), async (c) =>
    c.json(await c.var.whiteboard.store.insertPin(c.req.valid('json'))),
  )
  .put('/pins/:id', zValidator('json', pinRow.partial()), async (c) =>
    c.json(found(await c.var.whiteboard.store.updatePin(c.req.param('id'), c.req.valid('json')))),
  )
  .delete('/pins/:id', async (c) => c.json({deleted: await c.var.whiteboard.store.deletePin(c.req.param('id'))}))

  .get('/reads', zValidator('query', roomQuery), async (c) =>
    c.json(
      await c.var.whiteboard.store.db
        .select()
        .from(reads)
        .where(eq(reads.sessionId, c.req.valid('query').room)),
    ),
  )
  .post('/reads', zValidator('json', readRow), async (c) =>
    c.json(await c.var.whiteboard.store.insertRead(c.req.valid('json'))),
  )
  .put('/reads/:id', zValidator('json', readRow.partial()), async (c) =>
    c.json(found(await c.var.whiteboard.store.updateRead(c.req.param('id'), c.req.valid('json')))),
  )
  .delete('/reads/:id', async (c) => c.json({deleted: await c.var.whiteboard.store.deleteRead(c.req.param('id'))}))

  .get('/canvasPending', zValidator('query', roomQuery), async (c) =>
    c.json(
      await c.var.whiteboard.store.db
        .select()
        .from(canvasPending)
        .where(eq(canvasPending.room, c.req.valid('query').room)),
    ),
  )
  .post('/canvasPending', zValidator('json', pendingRow), async (c) =>
    c.json(await c.var.whiteboard.store.insertPending(c.req.valid('json'))),
  )
  .put('/canvasPending/:id', zValidator('json', pendingRow.partial()), async (c) =>
    c.json(found(await c.var.whiteboard.store.updatePending(c.req.param('id'), c.req.valid('json')))),
  )
  .delete('/canvasPending/:id', async (c) =>
    c.json({deleted: await c.var.whiteboard.store.deletePending(c.req.param('id'))}),
  )

  .get('/canvasReplies', zValidator('query', roomQuery), async (c) =>
    c.json(
      await c.var.whiteboard.store.db
        .select()
        .from(canvasReplies)
        .where(eq(canvasReplies.room, c.req.valid('query').room)),
    ),
  )
  .post('/canvasReplies', zValidator('json', replyRow), async (c) =>
    c.json(await c.var.whiteboard.store.insertReply(c.req.valid('json'))),
  )
  .put('/canvasReplies/:id', zValidator('json', replyRow.partial()), async (c) =>
    c.json(found(await c.var.whiteboard.store.updateReply(c.req.param('id'), c.req.valid('json')))),
  )
  .delete('/canvasReplies/:id', async (c) =>
    c.json({deleted: await c.var.whiteboard.store.deleteReply(c.req.param('id'))}),
  )

  .get('/elements/:scope', zValidator('param', scopeParam), zValidator('query', roomQuery), async (c) =>
    c.json(await c.var.whiteboard.store.listElements(c.req.valid('param').scope, c.req.valid('query').room)),
  )
  .put('/elements/:scope', zValidator('param', scopeParam), zValidator('json', elementRow), async (c) => {
    const outcome = await c.var.whiteboard.store.upsertElement(c.req.valid('param').scope, c.req.valid('json'))
    if (!outcome.ok) return c.json({current: outcome.current}, 409)
    return c.json(outcome.row)
  })
  .put('/elements/:scope/bulk', zValidator('param', scopeParam), zValidator('json', bulkBody), async (c) =>
    c.json({rows: await c.var.whiteboard.store.upsertElements(c.req.valid('param').scope, c.req.valid('json').rows)}),
  )
  .post(
    '/elements/:scope/bulk-delete',
    zValidator('param', scopeParam),
    zValidator('json', bulkDeleteBody),
    async (c) => {
      const {room, elementIds} = c.req.valid('json')
      return c.json({
        deleted: await c.var.whiteboard.store.deleteElements(c.req.valid('param').scope, room, elementIds),
      })
    },
  )

  .post('/cursor', zValidator('json', cursorEvent), async (c) => {
    c.var.whiteboard.store.cursor(c.req.valid('json'))
    return c.json({ok: true})
  })

  .get('/changes', zValidator('query', roomQuery), (c) => {
    const {store} = c.var.whiteboard
    const room = c.req.valid('query').room
    return streamSSE(c, async (stream) => {
      await stream.write(': whiteboard changes open\n\n')
      await new Promise<void>((resolve) => {
        const unsubscribe = store.onEvent((change) => {
          if (change.room !== room) return
          if (change.table === 'cursor') {
            return void stream.writeSSE({event: 'cursor', data: JSON.stringify(change.cursor)})
          }
          const payload =
            change.type === 'upsert' ? {type: 'upsert', row: change.row} : {type: 'delete', key: change.key}
          void stream.writeSSE({event: change.table, data: JSON.stringify(payload)})
        })
        const heartbeat = setInterval(() => void stream.writeSSE({event: 'ping', data: '{}'}), 15_000)
        stream.onAbort(() => {
          clearInterval(heartbeat)
          unsubscribe()
          resolve()
        })
      })
    })
  })

export type WhiteboardAppType = typeof whiteboardApp
