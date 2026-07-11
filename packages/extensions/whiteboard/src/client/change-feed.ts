import {makeExtRpcClient} from '@conciv/extension'
import type {CursorEvent} from '../shared/rows.js'
import type {WhiteboardRouter} from '../server/router.js'

export type ChangeMessage = {type: 'upsert'; row: unknown} | {type: 'delete'; key: string}
type Handler = (message: ChangeMessage) => void

export function createChangeFeed(apiBase: string, room: string) {
  const tableHandlers = new Map<string, Set<Handler>>()
  const reconnectHandlers = new Set<() => void>()
  const cursorHandlers = new Set<(cursor: CursorEvent) => void>()

  const client = makeExtRpcClient<WhiteboardRouter>(apiBase, 'whiteboard', {
    onRetry: () => (success) => {
      if (success) reconnectHandlers.forEach((handler) => handler())
    },
  })

  const abort = new AbortController()
  void (async () => {
    try {
      const changes = await client.changes({room}, {signal: abort.signal, context: {retry: Number.POSITIVE_INFINITY}})
      for await (const event of changes) {
        if (event.table === 'cursor') {
          cursorHandlers.forEach((handler) => handler(event.cursor))
          continue
        }
        const message: ChangeMessage =
          event.type === 'delete' ? {type: 'delete', key: event.key} : {type: 'upsert', row: event.row}
        tableHandlers.get(event.table)?.forEach((handler) => handler(message))
      }
    } catch {}
  })()

  return {
    subscribe: (table: string, handler: Handler): (() => void) => {
      const existing = tableHandlers.get(table)
      if (existing) existing.add(handler)
      if (!existing) tableHandlers.set(table, new Set([handler]))
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
    close: () => abort.abort(),
  }
}

export type ChangeFeed = ReturnType<typeof createChangeFeed>
