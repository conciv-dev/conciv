import {changeOf, cursorEvent, elementRow, type CursorEvent} from '../shared/rows.js'

export type ChangeMessage = {type: 'upsert'; row: unknown} | {type: 'delete'; key: string}
type Handler = (message: ChangeMessage) => void

const parseData = (event: Event): string | undefined =>
  event instanceof MessageEvent && typeof event.data === 'string' ? event.data : undefined

const feedMessage = changeOf(elementRow)

export function createChangeFeed(base: string, room: string) {
  const source = new EventSource(`${base}/changes?room=${encodeURIComponent(room)}`)
  const tableHandlers = new Map<string, Set<Handler>>()
  const reconnectHandlers = new Set<() => void>()
  const cursorHandlers = new Set<(cursor: CursorEvent) => void>()
  let dropped = false

  const listenTable = (table: string): void =>
    source.addEventListener(table, (event) => {
      const data = parseData(event)
      if (!data) return
      const parsed = feedMessage.parse(JSON.parse(data))
      const message: ChangeMessage =
        parsed.type === 'delete' ? {type: 'delete', key: parsed.key} : {type: 'upsert', row: parsed.row}
      tableHandlers.get(table)?.forEach((handler) => handler(message))
    })

  source.addEventListener('cursor', (event) => {
    const data = parseData(event)
    if (!data) return
    cursorHandlers.forEach((handler) => handler(cursorEvent.parse(JSON.parse(data))))
  })
  source.addEventListener('error', () => void (dropped = true))
  source.addEventListener('open', () => {
    if (!dropped) return
    dropped = false
    reconnectHandlers.forEach((handler) => handler())
  })

  return {
    subscribe: (table: string, handler: Handler): (() => void) => {
      const existing = tableHandlers.get(table)
      if (existing) existing.add(handler)
      if (!existing) {
        tableHandlers.set(table, new Set([handler]))
        listenTable(table)
      }
      return () => void tableHandlers.get(table)?.delete(handler)
    },
    onReconnect: (handler: () => void): (() => void) => {
      reconnectHandlers.add(handler)
      return () => void reconnectHandlers.delete(handler)
    },
    onCursor: (handler: (cursor: CursorEvent) => void): (() => void) => {
      cursorHandlers.add(handler)
      return () => void cursorHandlers.delete(handler)
    },
    close: () => source.close(),
  }
}

export type ChangeFeed = ReturnType<typeof createChangeFeed>
