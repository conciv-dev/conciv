import {AsyncRetryer} from '@tanstack/pacer'
import type {Context} from '@conciv/plugin/experimental'
import {z} from 'zod'
import {Whiteboard} from '../rpc.js'

export type ChangeMessage = {type: 'upsert' | 'delete'; key: string} | {type: 'reload'}
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
const RETRY_MAX_WAIT_MS = 10_000

export function createChangeFeed(client: Context['client'], room: string, options: {retryMs: number}) {
  const tableHandlers = new Map<string, Set<Handler>>()
  const position = {cursor: 0}
  const whiteboard = client.rpc(Whiteboard)
  const abort = new AbortController()

  const sinceRetried = (cursor: number) =>
    new AsyncRetryer(() => whiteboard.since({room, cursor}, {signal: abort.signal}), {
      maxAttempts: () => (abort.signal.aborted ? 0 : Number.POSITIVE_INFINITY),
      backoff: 'exponential',
      baseWait: options.retryMs,
      maxWait: RETRY_MAX_WAIT_MS,
      onError: (error) => {
        if (!abort.signal.aborted) console.error('[whiteboard] the change feed could not be read; retrying', error)
      },
    }).execute()

  const readPosition = async (): Promise<void> => {
    const latest = await sinceRetried(LATEST)
    if (latest) position.cursor = Math.max(position.cursor, latest.cursor)
  }
  const current = {opened: readPosition()}

  const route = (change: {table: string; key: string; type: 'upsert' | 'delete'; cursor: number}): void => {
    if (change.cursor <= position.cursor) return
    position.cursor = change.cursor
    tableHandlers.get(change.table)?.forEach((handler) => handler({type: change.type, key: change.key}))
  }

  const catchUp = async (): Promise<void> => {
    await current.opened
    const missed = await sinceRetried(position.cursor)
    missed?.changes.forEach(route)
  }

  const follow = async (): Promise<void> => {
    for await (const event of client.event.subscribe({types: ['rpc.whiteboard.changed'], signal: abort.signal})) {
      if (event.type === 'server.connected') {
        await catchUp()
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

  const reload = async (): Promise<void> => {
    current.opened = readPosition()
    await current.opened
    tableHandlers.forEach((handlers) => handlers.forEach((handler) => handler({type: 'reload'})))
  }

  const run = async (): Promise<void> => {
    while (!abort.signal.aborted) {
      await follow().catch((error: unknown) => {
        if (!abort.signal.aborted) console.error('[whiteboard] the change events stopped; reloading the tables', error)
      })
      if (abort.signal.aborted) return
      await reload()
    }
  }

  void run()

  return {
    opened: () => current.opened,
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
