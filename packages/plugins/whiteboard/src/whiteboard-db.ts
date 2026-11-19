import {createCollection} from '@tanstack/solid-db'
import {usePlugin, type Context} from '@conciv/plugin/experimental'
import {Effect, Exit, Scope} from 'effect'
import {Whiteboard} from './rpc.js'
import {
  elementRowToInsert,
  type CommentRow,
  type ElementRow,
  type PendingRow,
  type PinRow,
  type ReadRow,
  type ReplyRow,
} from './rows.js'
import {makeChangeFeed, rpcChangeSource} from './change-feed.js'
import {whiteboardStores} from './stores.js'
import {whiteboardCollectionOptions, whiteboardElementOptions} from './whiteboard-collection.js'

const withoutRoom = <Row extends {room: string}>({room: _room, ...row}: Row): Omit<Row, 'room'> => row
const withoutSession = <Row extends {sessionId: string}>({sessionId: _session, ...row}: Row): Omit<Row, 'sessionId'> =>
  row

export function createWhiteboardDb(client: Context['client'], room: string, catchUpRetryMs: number) {
  const whiteboard = client.rpc(Whiteboard)
  const feedScope = Effect.runSync(Scope.make())
  const feed = Effect.runSync(
    makeChangeFeed(rpcChangeSource(client, room), {retryMs: catchUpRetryMs}).pipe(Scope.provide(feedScope)),
  )
  const plugin = usePlugin<{stores: typeof whiteboardStores}>()
  const account = plugin.stores.account
  const onWriteFailed = (error: unknown): void => {
    Effect.runFork(
      Effect.logError('a change could not be saved', error).pipe(Effect.annotateLogs({plugin: 'whiteboard', room})),
    )
    void plugin.toast.show({title: 'Could not save your whiteboard change. Try again.', variant: 'error'})
  }
  const fresh = account.value.id ?? crypto.randomUUID()
  if (account.value.id === null) account.set({id: fresh})

  const comments = createCollection(
    whiteboardCollectionOptions<CommentRow, Omit<CommentRow, 'sessionId'>>({
      feed,
      room,
      table: 'comments',
      ops: {
        list: () => whiteboard['comments.list']({room}),
        get: (id) => whiteboard['comments.get']({room, id}),
        insert: (row) => whiteboard['comments.insert']({room, row}),
        update: (id, patch) => whiteboard['comments.update']({room, id, patch}),
        remove: (id) => whiteboard['comments.remove']({room, id}),
      },
      toInsert: withoutSession,
      onWriteFailed,
    }),
  )
  const pins = createCollection(
    whiteboardCollectionOptions<PinRow, Omit<PinRow, 'room'>>({
      feed,
      room,
      table: 'pins',
      ops: {
        list: () => whiteboard['pins.list']({room}),
        get: (id) => whiteboard['pins.get']({room, id}),
        insert: (row) => whiteboard['pins.insert']({room, row}),
        update: (id, patch) => whiteboard['pins.update']({room, id, patch}),
        remove: (id) => whiteboard['pins.remove']({room, id}),
      },
      toInsert: withoutRoom,
      onWriteFailed,
    }),
  )
  const reads = createCollection(
    whiteboardCollectionOptions<ReadRow, Omit<ReadRow, 'sessionId'>>({
      feed,
      room,
      table: 'reads',
      ops: {
        list: () => whiteboard['reads.list']({room}),
        get: (id) => whiteboard['reads.get']({room, id}),
        insert: (row) => whiteboard['reads.insert']({room, row}),
        update: (id, patch) => whiteboard['reads.update']({room, id, patch}),
        remove: (id) => whiteboard['reads.remove']({room, id}),
      },
      toInsert: withoutSession,
      onWriteFailed,
    }),
  )
  const canvasPending = createCollection(
    whiteboardCollectionOptions<PendingRow, Omit<PendingRow, 'room'>>({
      feed,
      room,
      table: 'canvasPending',
      ops: {
        list: () => whiteboard['canvasPending.list']({room}),
        get: (id) => whiteboard['canvasPending.get']({room, id}),
        insert: (row) => whiteboard['canvasPending.insert']({room, row}),
        update: (id, patch) => whiteboard['canvasPending.update']({room, id, patch}),
        remove: (id) => whiteboard['canvasPending.remove']({room, id}),
      },
      toInsert: withoutRoom,
      onWriteFailed,
    }),
  )
  const canvasReplies = createCollection(
    whiteboardCollectionOptions<ReplyRow, Omit<ReplyRow, 'room'>>({
      feed,
      room,
      table: 'canvasReplies',
      ops: {
        list: () => whiteboard['canvasReplies.list']({room}),
        get: (id) => whiteboard['canvasReplies.get']({room, id}),
        insert: (row) => whiteboard['canvasReplies.insert']({room, row}),
        update: (id, patch) => whiteboard['canvasReplies.update']({room, id, patch}),
        remove: (id) => whiteboard['canvasReplies.remove']({room, id}),
      },
      toInsert: withoutRoom,
      onWriteFailed,
    }),
  )
  const elementOps = (scope: 'live' | 'draft') => ({
    list: () => whiteboard['elements.list']({room, scope}),
    get: (elementId: string) => whiteboard['elements.get']({room, scope, elementId}),
    upsert: (row: ElementRow) => whiteboard['elements.upsert']({room, scope, row: elementRowToInsert(row)}),
    bulkUpsert: (rows: ElementRow[]) =>
      whiteboard['elements.bulkUpsert']({room, scope, rows: rows.map(elementRowToInsert)}),
    bulkDelete: (elementIds: string[]) => whiteboard['elements.bulkDelete']({room, scope, elementIds}),
  })
  const canvasElements = createCollection(
    whiteboardElementOptions({feed, room, scope: 'live', ops: elementOps('live')}),
  )
  const canvasDraftElements = createCollection(
    whiteboardElementOptions({feed, room, scope: 'draft', ops: elementOps('draft')}),
  )

  return {
    comments,
    pins,
    reads,
    canvasPending,
    canvasReplies,
    canvasElements,
    canvasDraftElements,
    bulkUpsertElements: (scope: 'live' | 'draft', rows: ElementRow[]) => elementOps(scope).bulkUpsert(rows),
    claimPending: (id: string) => whiteboard['canvasPending.claim']({room, id}),
    listElements: (scope: 'live' | 'draft') => elementOps(scope).list(),
    bulkDeleteElements: (scope: 'live' | 'draft', elementIds: string[]) => elementOps(scope).bulkDelete(elementIds),
    accountId: (): string => account.value.id ?? fresh,
    room,
    dispose: () => {
      canvasElements.utils.cleanupStrategy()
      canvasDraftElements.utils.cleanupStrategy()
      void Effect.runFork(Scope.close(feedScope, Exit.void))
    },
  }
}

export type WhiteboardDb = ReturnType<typeof createWhiteboardDb>
