import type {RpcHandlers} from '@conciv/plugin/effect/rpc'
import {and, eq} from 'drizzle-orm'
import {Effect} from 'effect'
import type {Whiteboard} from '../rpc.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store} from './db/store.js'

const notFound = (id: string) => ({id})

function found<Row, Missing>(read: () => Promise<Row>, missing: () => Missing) {
  return Effect.promise(read).pipe(Effect.flatMap(Effect.fromNullishOr), Effect.mapError(missing))
}

export function whiteboardHandlers(store: Store): RpcHandlers<typeof Whiteboard> {
  const db = store.db
  return {
    'comments.list': ({room}) => Effect.promise(() => db.select().from(comments).where(eq(comments.sessionId, room))),
    'comments.get': ({room, id}, {error}) =>
      found(
        () =>
          db
            .select()
            .from(comments)
            .where(and(eq(comments.id, id), eq(comments.sessionId, room)))
            .get(),
        () => error('NOT_FOUND', `no comment ${id} in this room`, notFound(id)),
      ),
    'comments.insert': ({room, row}) => Effect.promise(() => store.insertComment({...row, sessionId: room})),
    'comments.update': ({room, id, patch}, {error}) =>
      found(
        () => store.updateComment(id, room, patch),
        () => error('NOT_FOUND', `no comment ${id} in this room`, notFound(id)),
      ),
    'comments.remove': ({room, id}) => Effect.promise(async () => ({deleted: await store.deleteComment(id, room)})),
    'pins.list': ({room}) => Effect.promise(() => db.select().from(pins).where(eq(pins.room, room))),
    'pins.get': ({room, id}, {error}) =>
      found(
        () =>
          db
            .select()
            .from(pins)
            .where(and(eq(pins.id, id), eq(pins.room, room)))
            .get(),
        () => error('NOT_FOUND', `no pin ${id} in this room`, notFound(id)),
      ),
    'pins.insert': ({room, row}) => Effect.promise(() => store.insertPin({...row, room})),
    'pins.update': ({room, id, patch}, {error}) =>
      found(
        () => store.updatePin(id, room, patch),
        () => error('NOT_FOUND', `no pin ${id} in this room`, notFound(id)),
      ),
    'pins.remove': ({room, id}) => Effect.promise(async () => ({deleted: await store.deletePin(id, room)})),
    'reads.list': ({room}) => Effect.promise(() => db.select().from(reads).where(eq(reads.sessionId, room))),
    'reads.get': ({room, id}, {error}) =>
      found(
        () =>
          db
            .select()
            .from(reads)
            .where(and(eq(reads.id, id), eq(reads.sessionId, room)))
            .get(),
        () => error('NOT_FOUND', `no read ${id} in this room`, notFound(id)),
      ),
    'reads.insert': ({room, row}) => Effect.promise(() => store.insertRead({...row, sessionId: room})),
    'reads.update': ({room, id, patch}, {error}) =>
      found(
        () => store.updateRead(id, room, patch),
        () => error('NOT_FOUND', `no read ${id} in this room`, notFound(id)),
      ),
    'reads.remove': ({room, id}) => Effect.promise(async () => ({deleted: await store.deleteRead(id, room)})),
    'canvasPending.list': ({room}) =>
      Effect.promise(() => db.select().from(canvasPending).where(eq(canvasPending.room, room))),
    'canvasPending.get': ({room, id}, {error}) =>
      found(
        () =>
          db
            .select()
            .from(canvasPending)
            .where(and(eq(canvasPending.id, id), eq(canvasPending.room, room)))
            .get(),
        () => error('NOT_FOUND', `no pending row ${id} in this room`, notFound(id)),
      ),
    'canvasPending.insert': ({room, row}) => Effect.promise(() => store.insertPending({...row, room})),
    'canvasPending.update': ({room, id, patch}, {error}) =>
      found(
        () => store.updatePending(id, room, patch),
        () => error('NOT_FOUND', `no pending row ${id} in this room`, notFound(id)),
      ),
    'canvasPending.remove': ({room, id}) =>
      Effect.promise(async () => ({deleted: await store.deletePending(id, room)})),
    'canvasPending.claim': ({room, id}) => Effect.promise(async () => ({claimed: await store.claimPending(id, room)})),
    'canvasReplies.list': ({room}) =>
      Effect.promise(() => db.select().from(canvasReplies).where(eq(canvasReplies.room, room))),
    'canvasReplies.get': ({room, id}, {error}) =>
      found(
        () =>
          db
            .select()
            .from(canvasReplies)
            .where(and(eq(canvasReplies.id, id), eq(canvasReplies.room, room)))
            .get(),
        () => error('NOT_FOUND', `no reply ${id} in this room`, notFound(id)),
      ),
    'canvasReplies.insert': ({room, row}) => Effect.promise(() => store.insertReply({...row, room})),
    'canvasReplies.update': ({room, id, patch}, {error}) =>
      found(
        () => store.updateReply(id, room, patch),
        () => error('NOT_FOUND', `no reply ${id} in this room`, notFound(id)),
      ),
    'canvasReplies.remove': ({room, id}) => Effect.promise(async () => ({deleted: await store.deleteReply(id, room)})),
    'elements.list': ({room, scope}) => Effect.promise(() => store.listElements(scope, room)),
    'elements.get': ({room, scope, elementId}, {error}) =>
      found(
        () => store.getElement(scope, room, elementId),
        () => error('NOT_FOUND', `no element ${elementId} in this room`, notFound(elementId)),
      ),
    'elements.upsert': ({room, scope, row}, {error}) =>
      Effect.promise(() => store.upsertElement(scope, {...row, room})).pipe(
        Effect.flatMap((outcome) =>
          outcome.ok
            ? Effect.succeed(outcome.row)
            : Effect.fail(error('CONFLICT', 'element version conflict', {current: outcome.current})),
        ),
      ),
    'elements.bulkUpsert': ({room, scope, rows}) =>
      Effect.promise(async () => ({
        rows: await store.upsertElements(
          scope,
          rows.map((row) => ({...row, room})),
        ),
      })),
    'elements.bulkDelete': ({room, scope, elementIds}) =>
      Effect.promise(async () => ({deleted: await store.deleteElements(scope, room, elementIds)})),
    since: ({room, cursor}) => Effect.promise(() => store.since(room, cursor)),
  }
}
