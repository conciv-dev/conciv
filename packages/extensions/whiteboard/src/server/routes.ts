import {createEventStream, getQuery, getRouterParam, HTTPError, readValidatedBody} from 'h3'
import type {H3, H3Event} from 'h3'
import {eq} from 'drizzle-orm'
import {z} from 'zod'
import {commentRow, cursorEvent, elementRow, pendingRow, pinRow, readRow, replyRow} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {ElementScope, Store} from './db/store.js'

const roomQuery = (event: H3Event): string => {
  const room = getQuery(event).room
  if (typeof room !== 'string' || !room) throw new HTTPError({status: 400, message: 'room required'})
  return room
}

const idParam = (event: H3Event): string => {
  const id = getRouterParam(event, 'id')
  if (!id) throw new HTTPError({status: 400, message: 'id required'})
  return id
}

const scopeOf = (event: H3Event): ElementScope => {
  const parsed = z.enum(['live', 'draft']).safeParse(getRouterParam(event, 'scope'))
  if (!parsed.success) throw new HTTPError({status: 400, message: 'bad scope'})
  return parsed.data
}

const found = <Row>(row: Row | undefined): Row => {
  if (!row) throw new HTTPError({status: 404, message: 'row not found'})
  return row
}

export const registerRoutes = (app: H3, store: Store): void => {
  app.get('/comments', (event) =>
    store.db
      .select()
      .from(comments)
      .where(eq(comments.sessionId, roomQuery(event))),
  )
  app.post('/comments', async (event) => store.insertComment(await readValidatedBody(event, commentRow)))
  app.put('/comments/:id', async (event) =>
    found(await store.updateComment(idParam(event), await readValidatedBody(event, commentRow.partial()))),
  )
  app.delete('/comments/:id', async (event) => ({deleted: await store.deleteComment(idParam(event))}))

  app.get('/pins', (event) =>
    store.db
      .select()
      .from(pins)
      .where(eq(pins.room, roomQuery(event))),
  )
  app.post('/pins', async (event) => store.insertPin(await readValidatedBody(event, pinRow)))
  app.put('/pins/:id', async (event) =>
    found(await store.updatePin(idParam(event), await readValidatedBody(event, pinRow.partial()))),
  )
  app.delete('/pins/:id', async (event) => ({deleted: await store.deletePin(idParam(event))}))

  app.get('/reads', (event) =>
    store.db
      .select()
      .from(reads)
      .where(eq(reads.sessionId, roomQuery(event))),
  )
  app.post('/reads', async (event) => store.insertRead(await readValidatedBody(event, readRow)))
  app.put('/reads/:id', async (event) =>
    found(await store.updateRead(idParam(event), await readValidatedBody(event, readRow.partial()))),
  )
  app.delete('/reads/:id', async (event) => ({deleted: await store.deleteRead(idParam(event))}))

  app.get('/canvasPending', (event) =>
    store.db
      .select()
      .from(canvasPending)
      .where(eq(canvasPending.room, roomQuery(event))),
  )
  app.post('/canvasPending', async (event) => store.insertPending(await readValidatedBody(event, pendingRow)))
  app.put('/canvasPending/:id', async (event) =>
    found(await store.updatePending(idParam(event), await readValidatedBody(event, pendingRow.partial()))),
  )
  app.delete('/canvasPending/:id', async (event) => ({deleted: await store.deletePending(idParam(event))}))

  app.get('/canvasReplies', (event) =>
    store.db
      .select()
      .from(canvasReplies)
      .where(eq(canvasReplies.room, roomQuery(event))),
  )
  app.post('/canvasReplies', async (event) => store.insertReply(await readValidatedBody(event, replyRow)))
  app.put('/canvasReplies/:id', async (event) =>
    found(await store.updateReply(idParam(event), await readValidatedBody(event, replyRow.partial()))),
  )
  app.delete('/canvasReplies/:id', async (event) => ({deleted: await store.deleteReply(idParam(event))}))

  app.get('/elements/:scope', (event) => store.listElements(scopeOf(event), roomQuery(event)))
  app.put('/elements/:scope', async (event) => {
    const outcome = await store.upsertElement(scopeOf(event), await readValidatedBody(event, elementRow))
    if (!outcome.ok) throw new HTTPError({status: 409, body: {current: outcome.current}})
    return outcome.row
  })
  app.put('/elements/:scope/bulk', async (event) => {
    const {rows} = await readValidatedBody(event, z.object({rows: z.array(elementRow)}))
    return {written: (await store.upsertElements(scopeOf(event), rows)).length}
  })
  app.post('/elements/:scope/bulk-delete', async (event) => {
    const {room, elementIds} = await readValidatedBody(
      event,
      z.object({room: z.string(), elementIds: z.array(z.string())}),
    )
    return {deleted: await store.deleteElements(scopeOf(event), room, elementIds)}
  })

  app.post('/cursor', async (event) => {
    store.cursor(await readValidatedBody(event, cursorEvent))
    return {ok: true}
  })

  app.get('/changes', (event) => {
    const room = roomQuery(event)
    const stream = createEventStream(event)
    void stream.pushComment('whiteboard changes open')
    const unsubscribe = store.onEvent((change) => {
      if (change.room !== room) return
      if (change.table === 'cursor') return void stream.push({event: 'cursor', data: JSON.stringify(change.cursor)})
      const payload = change.type === 'upsert' ? {type: 'upsert', row: change.row} : {type: 'delete', key: change.key}
      void stream.push({event: change.table, data: JSON.stringify(payload)})
    })
    const heartbeat = setInterval(() => void stream.push({event: 'ping', data: '{}'}), 15_000)
    stream.onClosed(() => {
      clearInterval(heartbeat)
      unsubscribe()
    })
    return stream.send()
  })
}
