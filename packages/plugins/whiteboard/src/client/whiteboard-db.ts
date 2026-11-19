import {createCollection} from '@tanstack/solid-db'
import type {Context} from '@conciv/plugin/experimental'
import {Whiteboard} from '../rpc.js'
import {elementRowToInsert, type ElementRow, type PendingRow, type ReplyRow} from '../shared/rows.js'
import {createChangeFeed} from './change-feed.js'
import {whiteboardCollectionOptions, whiteboardElementOptions} from './whiteboard-collection.js'

const withoutRoom = <Row extends {room: string}>({room: _room, ...row}: Row): Omit<Row, 'room'> => row

export function createWhiteboardDb(client: Context['client'], room: string, catchUpRetryMs: number) {
  const whiteboard = client.rpc(Whiteboard)
  const feed = createChangeFeed(client, room, {retryMs: catchUpRetryMs})

  const canvasPending = createCollection(
    whiteboardCollectionOptions<PendingRow, Omit<PendingRow, 'room'>>({
      feed,
      room,
      table: 'canvasPending',
      ops: {
        list: () => whiteboard['canvasPending.list']({room}),
        get: (id) => whiteboard['canvasPending.get']({room, id}),
        insert: (row) => whiteboard['canvasPending.insert']({room, row}),
        remove: (id) => whiteboard['canvasPending.remove']({room, id}),
      },
      toInsert: withoutRoom,
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
        remove: (id) => whiteboard['canvasReplies.remove']({room, id}),
      },
      toInsert: withoutRoom,
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
    canvasPending,
    canvasReplies,
    canvasElements,
    canvasDraftElements,
    bulkUpsertElements: (scope: 'live' | 'draft', rows: ElementRow[]) => elementOps(scope).bulkUpsert(rows),
    claimPending: (id: string) => whiteboard['canvasPending.claim']({room, id}),
    listElements: (scope: 'live' | 'draft') => elementOps(scope).list(),
    bulkDeleteElements: (scope: 'live' | 'draft', elementIds: string[]) => elementOps(scope).bulkDelete(elementIds),
    room,
    dispose: () => {
      canvasElements.utils.cleanupStrategy()
      canvasDraftElements.utils.cleanupStrategy()
      feed.close()
    },
  }
}

export type WhiteboardDb = ReturnType<typeof createWhiteboardDb>
