import {createContext, createSignal, onCleanup, useContext, type JSX} from 'solid-js'
import {createCollection} from '@tanstack/solid-db'
import {commentRow, pendingRow, pinRow, readRow, replyRow, type CursorEvent} from '../shared/rows.js'
import {createChangeFeed} from './change-feed.js'
import {whiteboardCollectionOptions, whiteboardElementOptions} from './whiteboard-collection.js'

const accountId = (): string => {
  const key = 'conciv-whiteboard-account-id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const fresh = crypto.randomUUID()
  localStorage.setItem(key, fresh)
  return fresh
}

export function createWhiteboardDb(base: string, room: string) {
  const feed = createChangeFeed(base, room)

  const comments = createCollection(
    whiteboardCollectionOptions({feed, base, room, table: 'comments', schema: commentRow}),
  )
  const pins = createCollection(whiteboardCollectionOptions({feed, base, room, table: 'pins', schema: pinRow}))
  const reads = createCollection(whiteboardCollectionOptions({feed, base, room, table: 'reads', schema: readRow}))
  const canvasPending = createCollection(
    whiteboardCollectionOptions({feed, base, room, table: 'canvasPending', schema: pendingRow}),
  )
  const canvasReplies = createCollection(
    whiteboardCollectionOptions({feed, base, room, table: 'canvasReplies', schema: replyRow}),
  )
  const canvasElements = createCollection(whiteboardElementOptions({feed, base, room, scope: 'live'}))
  const canvasDraftElements = createCollection(whiteboardElementOptions({feed, base, room, scope: 'draft'}))

  const [cursors, setCursors] = createSignal<Map<string, CursorEvent>>(new Map())
  feed.onCursor((cursor) => setCursors((previous) => new Map(previous).set(cursor.peerId, cursor)))

  const postCursor = (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>): void =>
    void fetch(`${base}/cursor`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({...cursor, room, lastSeen: Date.now()}),
    }).catch(() => undefined)

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
    accountId,
    base,
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

export function WhiteboardDbProvider(props: {base: string; room: string; children: JSX.Element}): JSX.Element {
  const db = createWhiteboardDb(props.base, props.room)
  onCleanup(() => db.dispose())
  return <WhiteboardDbContext.Provider value={db}>{props.children}</WhiteboardDbContext.Provider>
}

export function useWhiteboardDb(): WhiteboardDb {
  const db = useContext(WhiteboardDbContext)
  if (!db) throw new Error('useWhiteboardDb must be used inside a WhiteboardDbProvider')
  return db
}
