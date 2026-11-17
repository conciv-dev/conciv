import type {Context} from '@conciv/plugin/experimental'
import {z} from 'zod'
import {Whiteboard} from '../rpc.js'

export type ChangeMessage = {type: 'upsert' | 'delete'; key: string}
type Handler = (message: ChangeMessage) => void

const ChangedEvent = z.object({
  type: z.literal('rpc.whiteboard.changed'),
  data: z.object({
    room: z.string(),
    table: z.string(),
    key: z.string(),
    type: z.enum(['upsert', 'delete']),
    cursor: z.number(),
  }),
})

const LATEST = Number.MAX_SAFE_INTEGER

export function createChangeFeed(client: Context['client'], room: string) {
  const tableHandlers = new Map<string, Set<Handler>>()
  const position = {cursor: 0}
  const whiteboard = client.rpc(Whiteboard)
  const abort = new AbortController()
  const opened = whiteboard.since({room, cursor: LATEST}, {signal: abort.signal}).then(
    (latest) => {
      position.cursor = Math.max(position.cursor, latest.cursor)
    },
    (error: unknown) => {
      if (!abort.signal.aborted) console.error('[whiteboard] the change position could not be read', error)
    },
  )

  const route = (change: {table: string; key: string; type: 'upsert' | 'delete'; cursor: number}): void => {
    if (change.cursor <= position.cursor) return
    position.cursor = change.cursor
    tableHandlers.get(change.table)?.forEach((handler) => handler({type: change.type, key: change.key}))
  }

  const catchUp = async (): Promise<void> => {
    await opened
    const missed = await whiteboard.since({room, cursor: position.cursor}, {signal: abort.signal})
    missed.changes.forEach(route)
  }

  const follow = async (): Promise<void> => {
    for await (const event of client.event.subscribe({types: ['rpc.whiteboard.changed'], signal: abort.signal})) {
      if (event.type === 'server.connected') {
        await catchUp().catch((error: unknown) => {
          if (!abort.signal.aborted) console.error('[whiteboard] the missed changes could not be read', error)
        })
        continue
      }
      const parsed = ChangedEvent.safeParse(event)
      if (!parsed.success) {
        console.error('[whiteboard] a change event did not match its schema', parsed.error)
        continue
      }
      if (parsed.data.data.room === room) route(parsed.data.data)
    }
  }

  void follow().catch((error: unknown) => {
    if (!abort.signal.aborted) console.error('[whiteboard] the change events stopped', error)
  })

  return {
    opened: () => opened,
    subscribe: (table: string, handler: Handler): (() => void) => {
      const existing = tableHandlers.get(table)
      if (existing) existing.add(handler)
      if (!existing) tableHandlers.set(table, new Set([handler]))
      return () => void tableHandlers.get(table)?.delete(handler)
    },
    close: () => abort.abort(),
  }
}

export type ChangeFeed = ReturnType<typeof createChangeFeed>
