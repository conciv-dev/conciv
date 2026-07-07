import {createPacedMutations, throttleStrategy} from '@tanstack/solid-db'
import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  SyncConfig,
  UpdateMutationFnParams,
} from '@tanstack/solid-db'
import {z} from 'zod'
import {elementRow, type ElementRow} from '../shared/rows.js'
import type {ChangeFeed} from './change-feed.js'

const jsonHeaders = (init?: RequestInit): HeadersInit | undefined =>
  init?.body ? {'content-type': 'application/json'} : undefined

const request = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, {...init, headers: jsonHeaders(init)})
  if (response.ok || response.status === 409) return response
  throw new Error(`whiteboard api ${response.status}: ${input}`)
}

type SyncParams<Row extends object> = Parameters<SyncConfig<Row, string>[`sync`]>[0]

const elementTableOf = (scope: 'live' | 'draft'): 'canvasElements' | 'canvasDraftElements' =>
  scope === 'draft' ? 'canvasDraftElements' : 'canvasElements'

export function whiteboardCollectionOptions<Row extends {id: string}>(deps: {
  feed: ChangeFeed
  base: string
  room: string
  table: string
  schema: z.ZodType<Row>
}) {
  const {feed, base, room, table, schema} = deps
  const rows = z.array(schema)
  let ctx: SyncParams<Row> | undefined

  const confirm = (row: Row): void => {
    if (!ctx) return
    ctx.begin({immediate: true})
    ctx.write({type: ctx.collection.has(row.id) ? 'update' : 'insert', value: row})
    ctx.commit()
  }
  const confirmDelete = (key: string): void => {
    if (!ctx || !ctx.collection.has(key)) return
    ctx.begin({immediate: true})
    ctx.write({type: 'delete', key})
    ctx.commit()
  }

  const sync: SyncConfig<Row, string> = {
    rowUpdateMode: 'full',
    sync: (params) => {
      ctx = params
      const load = async (replace: boolean): Promise<void> => {
        const loaded = rows.parse(await (await request(`${base}/${table}?room=${encodeURIComponent(room)}`)).json())
        params.begin()
        if (replace) params.truncate()
        loaded.forEach((row) => params.write({type: 'insert', value: row}))
        params.commit()
      }
      const off = feed.subscribe(table, (message) => {
        params.begin()
        if (message.type === 'delete') params.write({type: 'delete', key: message.key})
        if (message.type === 'upsert') {
          const row = schema.parse(message.row)
          params.write({type: params.collection.has(row.id) ? 'update' : 'insert', value: row})
        }
        params.commit()
      })
      const offReconnect = feed.onReconnect(() => void load(true))
      void load(false).finally(() => params.markReady())
      return () => {
        off()
        offReconnect()
      }
    },
  }

  return {
    id: `${table}:${room}`,
    getKey: (row: Row) => row.id,
    sync,
    onInsert: async ({transaction}: InsertMutationFnParams<Row, string>) => {
      for (const mutation of transaction.mutations) {
        const saved = schema.parse(
          await (await request(`${base}/${table}`, {method: 'POST', body: JSON.stringify(mutation.modified)})).json(),
        )
        confirm(saved)
      }
      return {refetch: false}
    },
    onUpdate: async ({transaction}: UpdateMutationFnParams<Row, string>) => {
      for (const mutation of transaction.mutations) {
        const saved = schema.parse(
          await (
            await request(`${base}/${table}/${String(mutation.key)}`, {
              method: 'PUT',
              body: JSON.stringify(mutation.changes),
            })
          ).json(),
        )
        confirm(saved)
      }
      return {refetch: false}
    },
    onDelete: async ({transaction}: DeleteMutationFnParams<Row, string>) => {
      for (const mutation of transaction.mutations) {
        await request(`${base}/${table}/${String(mutation.key)}`, {method: 'DELETE'})
        confirmDelete(String(mutation.key))
      }
      return {refetch: false}
    },
  }
}

export function whiteboardElementOptions(deps: {
  feed: ChangeFeed
  base: string
  room: string
  scope: 'live' | 'draft'
}) {
  const {feed, base, room, scope} = deps
  const table = elementTableOf(scope)
  const rows = z.array(elementRow)
  const conflict = z.object({current: elementRow})
  const bulkResult = z.object({rows: z.array(elementRow)})
  let ctx: SyncParams<ElementRow> | undefined

  const confirm = (row: ElementRow): void => {
    if (!ctx) return
    ctx.begin({immediate: true})
    ctx.write({type: ctx.collection.has(row.elementId) ? 'update' : 'insert', value: row})
    ctx.commit()
  }
  const putElement = async (row: ElementRow): Promise<void> => {
    const response = await request(`${base}/elements/${scope}`, {method: 'PUT', body: JSON.stringify(row)})
    const saved =
      response.status === 409 ? conflict.parse(await response.json()).current : elementRow.parse(await response.json())
    confirm(saved)
  }

  const strategy = throttleStrategy({wait: 50, leading: true, trailing: true})
  const pacedWrite = createPacedMutations<ElementRow, ElementRow>({
    strategy,
    onMutate: (row) => {
      if (!ctx) return
      if (ctx.collection.has(row.elementId))
        return void ctx.collection.update(row.elementId, (draft) => {
          draft.data = row.data
          draft.version = row.version
        })
      ctx.collection.insert(row)
    },
    mutationFn: async ({transaction}) => {
      const modified = transaction.mutations.map((mutation) => mutation.modified)
      const [first] = modified
      if (modified.length === 1 && first) return void (await putElement(first))
      const response = await request(`${base}/elements/${scope}/bulk`, {
        method: 'PUT',
        body: JSON.stringify({rows: modified}),
      })
      bulkResult.parse(await response.json()).rows.forEach((row) => confirm(row))
    },
  })

  const sync: SyncConfig<ElementRow, string> = {
    rowUpdateMode: 'full',
    sync: (params) => {
      ctx = params
      const load = async (replace: boolean): Promise<void> => {
        const loaded = rows.parse(
          await (await request(`${base}/elements/${scope}?room=${encodeURIComponent(room)}`)).json(),
        )
        params.begin()
        if (replace) params.truncate()
        loaded.forEach((row) => params.write({type: 'insert', value: row}))
        params.commit()
      }
      const off = feed.subscribe(table, (message) => {
        params.begin()
        if (message.type === 'delete') params.write({type: 'delete', key: message.key})
        if (message.type === 'upsert') {
          const row = elementRow.parse(message.row)
          params.write({type: params.collection.has(row.elementId) ? 'update' : 'insert', value: row})
        }
        params.commit()
      })
      const offReconnect = feed.onReconnect(() => void load(true))
      void load(false).finally(() => params.markReady())
      return () => {
        off()
        offReconnect()
      }
    },
  }

  return {
    id: `${table}:${room}`,
    getKey: (row: ElementRow) => row.elementId,
    sync,
    onDelete: async ({transaction}: DeleteMutationFnParams<ElementRow, string>) => {
      await request(`${base}/elements/${scope}/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({room, elementIds: transaction.mutations.map((mutation) => String(mutation.key))}),
      })
      return {refetch: false}
    },
    utils: {
      write: (row: ElementRow): void => void pacedWrite(row),
      cleanupStrategy: strategy.cleanup,
    },
  }
}
