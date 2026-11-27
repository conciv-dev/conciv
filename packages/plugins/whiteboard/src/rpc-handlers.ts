import type {RpcHandlers} from '@conciv/backend-plugin-api/effect/rpc'
import {Effect} from 'effect'
import type {EvlogError} from 'evlog'
import {z} from 'zod'
import {storeErrors} from './errors/store-errors.js'
import type {Whiteboard} from './rpc.js'
import {elementRow} from './rows.js'
import type {Store} from './store.js'

const Conflicted = z.object({current: elementRow})

function refuse<Value, Failure>(
  work: Effect.Effect<Value, EvlogError>,
  code: string,
  refusal: (error: EvlogError) => Effect.Effect<never, Failure>,
) {
  return work.pipe(Effect.catch((error) => (error.code === code ? refusal(error) : Effect.die(error))))
}

function missing<Value, Failure>(work: Effect.Effect<Value, EvlogError>, notFound: () => Failure) {
  return refuse(work, storeErrors.ROW_NOT_FOUND.code, () => Effect.fail(notFound()))
}

export function whiteboardHandlers(store: Store): RpcHandlers<typeof Whiteboard> {
  return {
    'comments.list': ({room}) => Effect.orDie(store.comments.list(room)),
    'comments.get': ({room, id}, {error}) =>
      missing(store.comments.get(room, id), () => error('NOT_FOUND', `no comment ${id} in this room`, {id})),
    'comments.insert': ({room, row}) => Effect.orDie(store.comments.insert(room, {...row, sessionId: room})),
    'comments.update': ({room, id, patch}, {error}) =>
      missing(store.comments.update(room, id, patch), () => error('NOT_FOUND', `no comment ${id} in this room`, {id})),
    'comments.remove': ({room, id}) =>
      Effect.orDie(store.comments.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'pins.list': ({room}) => Effect.orDie(store.pins.list(room)),
    'pins.get': ({room, id}, {error}) =>
      missing(store.pins.get(room, id), () => error('NOT_FOUND', `no pin ${id} in this room`, {id})),
    'pins.insert': ({room, row}) => Effect.orDie(store.pins.insert(room, {...row, room})),
    'pins.update': ({room, id, patch}, {error}) =>
      missing(store.pins.update(room, id, patch), () => error('NOT_FOUND', `no pin ${id} in this room`, {id})),
    'pins.remove': ({room, id}) => Effect.orDie(store.pins.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'reads.list': ({room}) => Effect.orDie(store.reads.list(room)),
    'reads.get': ({room, id}, {error}) =>
      missing(store.reads.get(room, id), () => error('NOT_FOUND', `no read ${id} in this room`, {id})),
    'reads.insert': ({room, row}) => Effect.orDie(store.reads.insert(room, {...row, sessionId: room})),
    'reads.update': ({room, id, patch}, {error}) =>
      missing(store.reads.update(room, id, patch), () => error('NOT_FOUND', `no read ${id} in this room`, {id})),
    'reads.remove': ({room, id}) =>
      Effect.orDie(store.reads.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'canvasPending.list': ({room}) => Effect.orDie(store.pending.list(room)),
    'canvasPending.get': ({room, id}, {error}) =>
      missing(store.pending.get(room, id), () => error('NOT_FOUND', `no pending row ${id} in this room`, {id})),
    'canvasPending.insert': ({room, row}) => Effect.orDie(store.pending.insert(room, {...row, room})),
    'canvasPending.update': ({room, id, patch}, {error}) =>
      missing(store.pending.update(room, id, patch), () =>
        error('NOT_FOUND', `no pending row ${id} in this room`, {id}),
      ),
    'canvasPending.remove': ({room, id}) =>
      Effect.orDie(store.pending.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'canvasPending.claim': ({room, id}) =>
      Effect.orDie(store.pending.claim(room, id)).pipe(Effect.map((claimed) => ({claimed}))),
    'canvasReplies.list': ({room}) => Effect.orDie(store.replies.list(room)),
    'canvasReplies.get': ({room, id}, {error}) =>
      missing(store.replies.get(room, id), () => error('NOT_FOUND', `no reply ${id} in this room`, {id})),
    'canvasReplies.insert': ({room, row}) => Effect.orDie(store.replies.insert(room, {...row, room})),
    'canvasReplies.update': ({room, id, patch}, {error}) =>
      missing(store.replies.update(room, id, patch), () => error('NOT_FOUND', `no reply ${id} in this room`, {id})),
    'canvasReplies.remove': ({room, id}) =>
      Effect.orDie(store.replies.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'elements.list': ({room, scope}) => Effect.orDie(store.listElements(scope, room)),
    'elements.get': ({room, scope, elementId}, {error}) =>
      Effect.orDie(store.getElement(scope, room, elementId)).pipe(
        Effect.flatMap((row) =>
          row
            ? Effect.succeed(row)
            : Effect.fail(error('NOT_FOUND', `no element ${elementId} in this room`, {id: elementId})),
        ),
      ),
    'elements.upsert': ({room, scope, row}, {error}) =>
      refuse(store.upsertElement(scope, {...row, room}), storeErrors.VERSION_CONFLICT.code, (conflict) => {
        const stored = Conflicted.safeParse(conflict.internal)
        return stored.success
          ? Effect.fail(error('CONFLICT', 'element version conflict', {current: stored.data.current}))
          : Effect.die(conflict)
      }),
    'elements.bulkUpsert': ({room, scope, rows}) =>
      Effect.orDie(
        store.upsertElements(
          scope,
          rows.map((row) => ({...row, room})),
        ),
      ).pipe(Effect.map((saved) => ({rows: saved}))),
    'elements.bulkDelete': ({room, scope, elementIds}) =>
      Effect.orDie(store.deleteElements(scope, room, elementIds)).pipe(Effect.map((deleted) => ({deleted}))),
    'cursor.move': ({room, cursor}) => store.cursor({...cursor, room}).pipe(Effect.map((): {ok: true} => ({ok: true}))),
    since: ({room, cursor}) => Effect.orDie(store.since(room, cursor)),
  }
}
