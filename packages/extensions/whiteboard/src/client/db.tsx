import {createContext, createSignal, onCleanup, useContext, type JSX} from 'solid-js'
import {createCollection} from '@tanstack/solid-db'
import {makeExtRpcClient} from '@conciv/extension'
import {
  commentRow,
  elementRow,
  pendingRow,
  pinRow,
  readRow,
  replyRow,
  type CursorEvent,
  type ElementRow,
} from '../shared/rows.js'
import type {WhiteboardRouter} from '../server/router.js'
import {createChangeFeed} from './change-feed.js'
import {whiteboardCollectionOptions, whiteboardElementOptions, type WhiteboardClient} from './whiteboard-collection.js'

const accountId = (): string => {
  const key = 'conciv-whiteboard-account-id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const fresh = crypto.randomUUID()
  localStorage.setItem(key, fresh)
  return fresh
}

export function createWhiteboardDb(apiBase: string, room: string) {
  const client: WhiteboardClient = makeExtRpcClient<WhiteboardRouter>(apiBase, 'whiteboard')
  const feed = createChangeFeed(apiBase, room)

  const comments = createCollection(
    whiteboardCollectionOptions({
      feed,
      room,
      table: 'comments',
      ops: client.comments,
      parseRow: (row) => commentRow.parse(row),
    }),
  )
  const pins = createCollection(
    whiteboardCollectionOptions({feed, room, table: 'pins', ops: client.pins, parseRow: (row) => pinRow.parse(row)}),
  )
  const reads = createCollection(
    whiteboardCollectionOptions({feed, room, table: 'reads', ops: client.reads, parseRow: (row) => readRow.parse(row)}),
  )
  const canvasPending = createCollection(
    whiteboardCollectionOptions({
      feed,
      room,
      table: 'canvasPending',
      ops: client.canvasPending,
      parseRow: (row) => pendingRow.parse(row),
    }),
  )
  const canvasReplies = createCollection(
    whiteboardCollectionOptions({
      feed,
      room,
      table: 'canvasReplies',
      ops: client.canvasReplies,
      parseRow: (row) => replyRow.parse(row),
    }),
  )
  const parseElement = (row: unknown) => elementRow.parse(row)
  const canvasElements = createCollection(
    whiteboardElementOptions({feed, client, room, scope: 'live', parseRow: parseElement}),
  )
  const canvasDraftElements = createCollection(
    whiteboardElementOptions({feed, client, room, scope: 'draft', parseRow: parseElement}),
  )

  const [cursors, setCursors] = createSignal<Map<string, CursorEvent>>(new Map())
  feed.onCursor((cursor) => setCursors((previous) => new Map(previous).set(cursor.peerId, cursor)))

  const postCursor = (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>): void =>
    void client.cursor({...cursor, room, lastSeen: Date.now()}).catch(() => undefined)

  return {
    comments,
    pins,
    reads,
    canvasPending,
    canvasReplies,
    canvasElements,
    canvasDraftElements,
    cursors,
    postCursor,
    bulkUpsertElements: (scope: 'live' | 'draft', rows: ElementRow[]) => client.elements.bulkUpsert({scope, rows}),
    accountId,
    room,
    dispose: () => {
      canvasElements.utils.cleanupStrategy()
      canvasDraftElements.utils.cleanupStrategy()
      feed.close()
    },
  }
}

export type WhiteboardDb = ReturnType<typeof createWhiteboardDb>

const WhiteboardDbContext = createContext<WhiteboardDb>()

export function WhiteboardDbProvider(props: {apiBase: string; room: string; children: JSX.Element}): JSX.Element {
  const db = createWhiteboardDb(props.apiBase, props.room)
  onCleanup(() => db.dispose())
  return <WhiteboardDbContext.Provider value={db}>{props.children}</WhiteboardDbContext.Provider>
}

export function useWhiteboardDb(): WhiteboardDb {
  const db = useContext(WhiteboardDbContext)
  if (!db) throw new Error('useWhiteboardDb must be used inside a WhiteboardDbProvider')
  return db
}
