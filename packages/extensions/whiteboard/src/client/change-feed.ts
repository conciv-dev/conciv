import {makeExtRpcClient} from '@conciv/extension'
import type {CursorEvent} from '../shared/rows.js'
import type {WhiteboardRouter} from '../server/router.js'

export type ChangeMessage = {type: 'upsert'; row: unknown} | {type: 'delete'; key: string}
type Handler = (message: ChangeMessage) => void

const RESUBSCRIBE_DELAY_MS = 250

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

export function createChangeFeed(apiBase: string, room: string) {
  const tableHandlers = new Map<string, Set<Handler>>()
  const reconnectHandlers = new Set<() => void>()
  const cursorHandlers = new Set<(cursor: CursorEvent) => void>()

  const client = makeExtRpcClient<WhiteboardRouter>(apiBase, 'whiteboard')

  const abort = new AbortController()
  async function runOnce(): Promise<void> {
    const changes = await client.changes(
      {room},
      {
        signal: abort.signal,
        context: {
          retry: Number.POSITIVE_INFINITY,
          onRetry: () => (success) => {
            if (success) reconnectHandlers.forEach((handler) => handler())
          },
        },
      },
    )
    for await (const event of changes) {
      if (event.table === 'cursor') {
        cursorHandlers.forEach((handler) => handler(event.cursor))
        continue
      }
      const message: ChangeMessage =
        event.type === 'delete' ? {type: 'delete', key: event.key} : {type: 'upsert', row: event.row}
      tableHandlers.get(event.table)?.forEach((handler) => handler(message))
    }
  }
  void (async () => {
    while (!abort.signal.aborted) {
      try {
        await runOnce()
      } catch {
        if (abort.signal.aborted) return
      }
      if (abort.signal.aborted) return
      await sleep(RESUBSCRIBE_DELAY_MS, abort.signal)
    }
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
