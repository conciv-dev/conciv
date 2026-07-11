import {createPacedMutations, throttleStrategy} from '@tanstack/solid-db'
import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  SyncConfig,
  UpdateMutationFnParams,
} from '@tanstack/solid-db'
import {safe} from '@orpc/client'
import type {RouterClient} from '@orpc/server'
import type {ElementRow} from '../shared/rows.js'
import type {WhiteboardRouter} from '../server/router.js'
import type {ChangeFeed, ChangeMessage} from './change-feed.js'

export const ELEMENT_WRITE_THROTTLE_MS = 50

export type WhiteboardClient = RouterClient<WhiteboardRouter>

type SyncParams<Row extends object> = Parameters<SyncConfig<Row, string>[`sync`]>[0]

const buildSync = <Row extends object>(deps: {
  feed: ChangeFeed
  table: string
  loadRows: () => Promise<Row[]>
  parseRow: (row: unknown) => Row
  keyOf: (row: Row) => string
  onReady: (params: SyncParams<Row>) => void
}): SyncConfig<Row, string> => {
  const {feed, table, loadRows, parseRow, keyOf, onReady} = deps
  return {
    rowUpdateMode: 'full',
    sync: (params) => {
      onReady(params)
      let ready = false
      const buffer: ChangeMessage[] = []
      const apply = (message: ChangeMessage): void => {
        params.begin()
        if (message.type === 'delete') params.write({type: 'delete', key: message.key})
        if (message.type === 'upsert') {
          const row = parseRow(message.row)
          params.write({type: params.collection.has(keyOf(row)) ? 'update' : 'insert', value: row})
        }
        params.commit()
      }
      const load = async (replace: boolean): Promise<void> => {
        const loaded = await loadRows()
        params.begin()
        if (replace) params.truncate()
        loaded.forEach((row) => params.write({type: 'insert', value: row}))
        params.commit()
      }
      const start = async (replace: boolean): Promise<void> => {
        ready = false
        await load(replace)
        ready = true
        buffer.splice(0).forEach(apply)
      }
      const off = feed.subscribe(table, (message) => {
        if (!ready) return void buffer.push(message)
        apply(message)
      })
      const offReconnect = feed.onReconnect(() => void start(true))
      void start(false).finally(() => params.markReady())
      return () => {
        off()
        offReconnect()
      }
    },
  }
}

type TableClient<Row extends object> = {
  list: (input: {room: string}) => Promise<Row[]>
  insert: (input: Row) => Promise<Row>
  update: (input: {id: string; patch: Record<string, unknown>}) => Promise<Row>
  remove: (input: {id: string}) => Promise<{deleted: boolean}>
}

export function whiteboardCollectionOptions<Row extends {id: string}>(deps: {
  feed: ChangeFeed
  room: string
  table: string
  ops: TableClient<Row>
  parseRow: (row: unknown) => Row
}) {
  const {feed, room, table, ops, parseRow} = deps
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

  return {
    id: `${table}:${room}`,
    getKey: (row: Row) => row.id,
    sync: buildSync<Row>({
      feed,
      table,
      loadRows: () => ops.list({room}),
      parseRow,
      keyOf: (row) => row.id,
      onReady: (params) => void (ctx = params),
    }),
    onInsert: async ({transaction}: InsertMutationFnParams<Row, string>) => {
      for (const mutation of transaction.mutations) {
        confirm(await ops.insert(mutation.modified))
      }
      return {refetch: false}
    },
    onUpdate: async ({transaction}: UpdateMutationFnParams<Row, string>) => {
      for (const mutation of transaction.mutations) {
        confirm(await ops.update({id: String(mutation.key), patch: mutation.changes}))
      }
      return {refetch: false}
    },
    onDelete: async ({transaction}: DeleteMutationFnParams<Row, string>) => {
      for (const mutation of transaction.mutations) {
        await ops.remove({id: String(mutation.key)})
        confirmDelete(String(mutation.key))
      }
      return {refetch: false}
    },
  }
}

export function whiteboardElementOptions(deps: {
  feed: ChangeFeed
  client: WhiteboardClient
  room: string
  scope: 'live' | 'draft'
  parseRow: (row: unknown) => ElementRow
}) {
  const {feed, client, room, scope, parseRow} = deps
  const table = scope === 'draft' ? 'canvasDraftElements' : 'canvasElements'
  let ctx: SyncParams<ElementRow> | undefined

  const confirm = (row: ElementRow): void => {
    if (!ctx) return
    ctx.begin({immediate: true})
    ctx.write({type: ctx.collection.has(row.elementId) ? 'update' : 'insert', value: row})
    ctx.commit()
  }
  const putElement = async (row: ElementRow): Promise<void> => {
    const {data, error, isDefined} = await safe(client.elements.upsert({scope, row}))
    if (data) return confirm(data)
    if (isDefined && error.code === 'CONFLICT') return confirm(error.data.current)
    throw error
  }

  const strategy = throttleStrategy({wait: ELEMENT_WRITE_THROTTLE_MS, leading: true, trailing: true})
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
      const {rows} = await client.elements.bulkUpsert({scope, rows: modified})
      rows.forEach((row) => confirm(row))
    },
  })

  return {
    id: `${table}:${room}`,
    getKey: (row: ElementRow) => row.elementId,
    sync: buildSync<ElementRow>({
      feed,
      table,
      loadRows: () => client.elements.list({scope, room}),
      parseRow,
      keyOf: (row) => row.elementId,
      onReady: (params) => void (ctx = params),
    }),
    onDelete: async ({transaction}: DeleteMutationFnParams<ElementRow, string>) => {
      await client.elements.bulkDelete({
        scope,
        room,
        elementIds: transaction.mutations.map((mutation) => String(mutation.key)),
      })
      return {refetch: false}
    },
    utils: {
      write: (row: ElementRow): void => void pacedWrite(row),
      cleanupStrategy: strategy.cleanup,
    },
  }
}
