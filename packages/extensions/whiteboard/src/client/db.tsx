import {createContext, createSignal, onCleanup, useContext, type JSX} from 'solid-js'
import {QueryClient} from '@tanstack/query-core'
import {createCollection} from '@tanstack/solid-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {z} from 'zod'
import {
  changeOf,
  commentRow,
  cursorEvent,
  elementRow,
  pendingRow,
  pinRow,
  readRow,
  replyRow,
  type CursorEvent,
  type ElementRow,
} from '../shared/rows.js'

const jsonHeaders = (init?: RequestInit): HeadersInit | undefined =>
  init?.body ? {'content-type': 'application/json'} : undefined

const request = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, {...init, headers: jsonHeaders(init)})
  if (response.ok || response.status === 409) return response
  throw new Error(`whiteboard api ${response.status}: ${input}`)
}

const accountId = (): string => {
  const key = 'conciv-whiteboard-account-id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const fresh = crypto.randomUUID()
  localStorage.setItem(key, fresh)
  return fresh
}

const messageData = (event: Event): string | undefined =>
  event instanceof MessageEvent && typeof event.data === 'string' ? event.data : undefined

const deferUntilReady = (collection: {isReady(): boolean; onFirstReady(callback: () => void): void}) => {
  const queue: Array<() => void> = []
  let ready = false
  collection.onFirstReady(() => {
    ready = true
    queue.splice(0).forEach((apply) => apply())
  })
  return (apply: () => void): void => {
    if (ready || collection.isReady()) return apply()
    queue.push(apply)
  }
}

export function createWhiteboardDb(base: string, room: string) {
  const queryClient = new QueryClient()
  const source = new EventSource(`${base}/changes?room=${encodeURIComponent(room)}`)

  const idCollection = <Row extends {id: string}>(table: string, schema: z.ZodType<Row>) => {
    const rows = z.array(schema)
    const change = changeOf(schema)
    const collection = createCollection(
      queryCollectionOptions({
        queryKey: [table, room],
        queryClient,
        queryFn: async () =>
          rows.parse(await (await request(`${base}/${table}?room=${encodeURIComponent(room)}`)).json()),
        getKey: (row: Row) => row.id,
        onInsert: async ({transaction}) => {
          const saved = await Promise.all(
            transaction.mutations.map(async (mutation) =>
              schema.parse(
                await (
                  await request(`${base}/${table}`, {method: 'POST', body: JSON.stringify(mutation.modified)})
                ).json(),
              ),
            ),
          )
          collection.utils.writeBatch(() => saved.forEach((row) => collection.utils.writeUpsert(row)))
          return {refetch: false}
        },
        onUpdate: async ({transaction}) => {
          const saved = await Promise.all(
            transaction.mutations.map(async (mutation) =>
              schema.parse(
                await (
                  await request(`${base}/${table}/${String(mutation.key)}`, {
                    method: 'PUT',
                    body: JSON.stringify(mutation.changes),
                  })
                ).json(),
              ),
            ),
          )
          collection.utils.writeBatch(() => saved.forEach((row) => collection.utils.writeUpsert(row)))
          return {refetch: false}
        },
        onDelete: async ({transaction}) => {
          await Promise.all(
            transaction.mutations.map((mutation) =>
              request(`${base}/${table}/${String(mutation.key)}`, {method: 'DELETE'}),
            ),
          )
          return {refetch: false}
        },
      }),
    )
    const onReady = deferUntilReady(collection)
    source.addEventListener(table, (event) => {
      const data = messageData(event)
      if (!data) return
      const message = change.parse(JSON.parse(data))
      onReady(() => {
        if (message.type === 'delete') return void collection.utils.writeDelete(message.key)
        collection.utils.writeUpsert(message.row)
      })
    })
    return collection
  }

  const elementCollection = (scope: 'live' | 'draft', table: 'canvasElements' | 'canvasDraftElements') => {
    const rows = z.array(elementRow)
    const change = changeOf(elementRow)
    const conflict = z.object({current: elementRow})
    const putElement = async (row: ElementRow): Promise<void> => {
      const response = await request(`${base}/elements/${scope}`, {method: 'PUT', body: JSON.stringify(row)})
      const saved =
        response.status === 409
          ? conflict.parse(await response.json()).current
          : elementRow.parse(await response.json())
      collection.utils.writeUpsert(saved)
    }
    const collection = createCollection(
      queryCollectionOptions({
        queryKey: [table, room],
        queryClient,
        queryFn: async () =>
          rows.parse(await (await request(`${base}/elements/${scope}?room=${encodeURIComponent(room)}`)).json()),
        getKey: (row: ElementRow) => row.elementId,
        onInsert: async ({transaction}) => {
          for (const mutation of transaction.mutations) await putElement(mutation.modified)
          return {refetch: false}
        },
        onUpdate: async ({transaction}) => {
          for (const mutation of transaction.mutations) await putElement(mutation.modified)
          return {refetch: false}
        },
        onDelete: async ({transaction}) => {
          await request(`${base}/elements/${scope}/bulk-delete`, {
            method: 'POST',
            body: JSON.stringify({room, elementIds: transaction.mutations.map((mutation) => String(mutation.key))}),
          })
          return {refetch: false}
        },
      }),
    )
    const onReady = deferUntilReady(collection)
    source.addEventListener(table, (event) => {
      const data = messageData(event)
      if (!data) return
      const message = change.parse(JSON.parse(data))
      onReady(() => {
        if (message.type === 'delete') return void collection.utils.writeDelete(message.key)
        collection.utils.writeUpsert(message.row)
      })
    })
    return collection
  }

  const collections = {
    canvasElements: elementCollection('live', 'canvasElements'),
    canvasDraftElements: elementCollection('draft', 'canvasDraftElements'),
    canvasPending: idCollection('canvasPending', pendingRow),
    canvasReplies: idCollection('canvasReplies', replyRow),
    comments: idCollection('comments', commentRow),
    pins: idCollection('pins', pinRow),
    reads: idCollection('reads', readRow),
  }

  const [cursors, setCursors] = createSignal<Map<string, CursorEvent>>(new Map())
  source.addEventListener('cursor', (event) => {
    const data = messageData(event)
    if (!data) return
    const cursor = cursorEvent.parse(JSON.parse(data))
    setCursors((previous) => new Map(previous).set(cursor.peerId, cursor))
  })

  let dropped = false
  source.addEventListener('error', () => {
    dropped = true
  })
  source.addEventListener('open', () => {
    if (!dropped) return
    dropped = false
    Object.values(collections).forEach((collection) => void collection.utils.refetch())
  })

  const postCursor = (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>): void =>
    void request(`${base}/cursor`, {
      method: 'POST',
      body: JSON.stringify({...cursor, room, lastSeen: Date.now()}),
    }).catch(() => undefined)

  return {
    ...collections,
    cursors,
    postCursor,
    accountId,
    base,
    room,
    dispose: () => source.close(),
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
