import type {RpcHandlers} from '@conciv/plugin'
import {eq} from 'drizzle-orm'
import type {Whiteboard} from '../rpc.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store} from './db/store.js'

const notFound = (id: string) => ({id})

export function whiteboardHandlers(store: Store): RpcHandlers<typeof Whiteboard> {
  const db = store.db
  return {
    'comments.list': ({room}) => db.select().from(comments).where(eq(comments.sessionId, room)),
    'comments.insert': ({room, row}) => store.insertComment({...row, sessionId: room}),
    'comments.update': async ({room, id, patch}, {error}) =>
      (await store.updateComment(id, room, patch)) ?? error('NOT_FOUND', `no comment ${id} in this room`, notFound(id)),
    'comments.remove': async ({room, id}) => ({deleted: await store.deleteComment(id, room)}),
    'pins.list': ({room}) => db.select().from(pins).where(eq(pins.room, room)),
    'pins.insert': ({room, row}) => store.insertPin({...row, room}),
    'pins.update': async ({room, id, patch}, {error}) =>
      (await store.updatePin(id, room, patch)) ?? error('NOT_FOUND', `no pin ${id} in this room`, notFound(id)),
    'pins.remove': async ({room, id}) => ({deleted: await store.deletePin(id, room)}),
    'reads.list': ({room}) => db.select().from(reads).where(eq(reads.sessionId, room)),
    'reads.insert': ({room, row}) => store.insertRead({...row, sessionId: room}),
    'reads.update': async ({room, id, patch}, {error}) =>
      (await store.updateRead(id, room, patch)) ?? error('NOT_FOUND', `no read ${id} in this room`, notFound(id)),
    'reads.remove': async ({room, id}) => ({deleted: await store.deleteRead(id, room)}),
    'canvasPending.list': ({room}) => db.select().from(canvasPending).where(eq(canvasPending.room, room)),
    'canvasPending.insert': ({room, row}) => store.insertPending({...row, room}),
    'canvasPending.update': async ({room, id, patch}, {error}) =>
      (await store.updatePending(id, room, patch)) ??
      error('NOT_FOUND', `no pending row ${id} in this room`, notFound(id)),
    'canvasPending.remove': async ({room, id}) => ({deleted: await store.deletePending(id, room)}),
    'canvasReplies.list': ({room}) => db.select().from(canvasReplies).where(eq(canvasReplies.room, room)),
    'canvasReplies.insert': ({room, row}) => store.insertReply({...row, room}),
    'canvasReplies.update': async ({room, id, patch}, {error}) =>
      (await store.updateReply(id, room, patch)) ?? error('NOT_FOUND', `no reply ${id} in this room`, notFound(id)),
    'canvasReplies.remove': async ({room, id}) => ({deleted: await store.deleteReply(id, room)}),
    'elements.list': ({room, scope}) => store.listElements(scope, room),
    'elements.upsert': async ({room, scope, row}, {error}) => {
      const outcome = await store.upsertElement(scope, {...row, room})
      if (outcome.ok) return outcome.row
      return error('CONFLICT', 'element version conflict', {current: outcome.current})
    },
    'elements.bulkUpsert': async ({room, scope, rows}) => ({
      rows: await store.upsertElements(
        scope,
        rows.map((row) => ({...row, room})),
      ),
    }),
    'elements.bulkDelete': async ({room, scope, elementIds}) => ({
      deleted: await store.deleteElements(scope, room, elementIds),
    }),
    since: ({room, cursor}) => store.since(room, cursor),
  }
}
