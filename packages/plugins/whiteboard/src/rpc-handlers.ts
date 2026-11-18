import type {RpcHandlers} from '@conciv/plugin/effect/rpc'
import {Effect, Schema} from 'effect'
import type {Whiteboard} from './rpc.js'
import {StoreError, type RowNotFound, type Store} from './store.js'

const isStoreError = Schema.is(StoreError)

function unreadable<Value, Failure>(work: Effect.Effect<Value, Failure>) {
  return work.pipe(Effect.catchIf(isStoreError, Effect.die))
}

const missing =
  <Failure>(what: string, error: (message: string, failure: RowNotFound) => Failure) =>
  (failure: RowNotFound) =>
    Effect.fail(error(`no ${what} ${failure.id} in this room`, failure))

export function whiteboardHandlers(store: Store): RpcHandlers<typeof Whiteboard> {
  return {
    'comments.list': ({room}) => unreadable(store.comments.list(room)),
    'comments.get': ({room, id}, {error}) =>
      unreadable(
        store.comments.get(room, id).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('comment', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'comments.insert': ({room, row}) => unreadable(store.comments.insert(room, {...row, sessionId: room})),
    'comments.update': ({room, id, patch}, {error}) =>
      unreadable(
        store.comments.update(room, id, patch).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('comment', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'comments.remove': ({room, id}) =>
      unreadable(store.comments.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'pins.list': ({room}) => unreadable(store.pins.list(room)),
    'pins.get': ({room, id}, {error}) =>
      unreadable(
        store.pins.get(room, id).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('pin', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'pins.insert': ({room, row}) => unreadable(store.pins.insert(room, {...row, room})),
    'pins.update': ({room, id, patch}, {error}) =>
      unreadable(
        store.pins.update(room, id, patch).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('pin', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'pins.remove': ({room, id}) => unreadable(store.pins.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'reads.list': ({room}) => unreadable(store.reads.list(room)),
    'reads.get': ({room, id}, {error}) =>
      unreadable(
        store.reads.get(room, id).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('read', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'reads.insert': ({room, row}) => unreadable(store.reads.insert(room, {...row, sessionId: room})),
    'reads.update': ({room, id, patch}, {error}) =>
      unreadable(
        store.reads.update(room, id, patch).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('read', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'reads.remove': ({room, id}) => unreadable(store.reads.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'canvasPending.list': ({room}) => unreadable(store.pending.list(room)),
    'canvasPending.get': ({room, id}, {error}) =>
      unreadable(
        store.pending.get(room, id).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('pending row', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'canvasPending.insert': ({room, row}) => unreadable(store.pending.insert(room, {...row, room})),
    'canvasPending.update': ({room, id, patch}, {error}) =>
      unreadable(
        store.pending.update(room, id, patch).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('pending row', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'canvasPending.remove': ({room, id}) =>
      unreadable(store.pending.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'canvasPending.claim': ({room, id}) =>
      unreadable(store.pending.claim(room, id)).pipe(Effect.map((claimed) => ({claimed}))),
    'canvasReplies.list': ({room}) => unreadable(store.replies.list(room)),
    'canvasReplies.get': ({room, id}, {error}) =>
      unreadable(
        store.replies.get(room, id).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('reply', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'canvasReplies.insert': ({room, row}) => unreadable(store.replies.insert(room, {...row, room})),
    'canvasReplies.update': ({room, id, patch}, {error}) =>
      unreadable(
        store.replies.update(room, id, patch).pipe(
          Effect.catchTag(
            'RowNotFound',
            missing('reply', (message, failure) => error('NOT_FOUND', message, {id: failure.id})),
          ),
        ),
      ),
    'canvasReplies.remove': ({room, id}) =>
      unreadable(store.replies.remove(room, id)).pipe(Effect.map((deleted) => ({deleted}))),
    'elements.list': ({room, scope}) => unreadable(store.listElements(scope, room)),
    'elements.get': ({room, scope, elementId}, {error}) =>
      unreadable(store.getElement(scope, room, elementId)).pipe(
        Effect.flatMap((row) =>
          row
            ? Effect.succeed(row)
            : Effect.fail(error('NOT_FOUND', `no element ${elementId} in this room`, {id: elementId})),
        ),
      ),
    'elements.upsert': ({room, scope, row}, {error}) =>
      unreadable(
        store
          .upsertElement(scope, {...row, room})
          .pipe(
            Effect.catchTag('VersionConflict', ({current}) =>
              Effect.fail(error('CONFLICT', 'element version conflict', {current})),
            ),
          ),
      ),
    'elements.bulkUpsert': ({room, scope, rows}) =>
      unreadable(
        store.upsertElements(
          scope,
          rows.map((row) => ({...row, room})),
        ),
      ).pipe(Effect.map((saved) => ({rows: saved}))),
    'elements.bulkDelete': ({room, scope, elementIds}) =>
      unreadable(store.deleteElements(scope, room, elementIds)).pipe(Effect.map((deleted) => ({deleted}))),
    since: ({room, cursor}) => unreadable(store.since(room, cursor)),
  }
}
