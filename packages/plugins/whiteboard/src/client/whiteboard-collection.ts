import {AsyncQueuer} from '@tanstack/pacer'
import {createPacedMutations, throttleStrategy} from '@tanstack/solid-db'
import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  SyncConfig,
  UpdateMutationFnParams,
} from '@tanstack/solid-db'
import {z} from 'zod'
import {elementRow, type ElementRow} from '../shared/rows.js'
import type {ChangeFeed, ChangeMessage} from './change-feed.js'

const ELEMENT_WRITE_THROTTLE_MS = 50

const NotFound = z.object({type: z.literal('NOT_FOUND')})
const Conflict = z.object({type: z.literal('CONFLICT'), data: z.object({current: elementRow})})

type SyncParams<Row extends object> = Parameters<SyncConfig<Row, string>['sync']>[0]

const readMissing = <Row>(read: Promise<Row>): Promise<Row | undefined> =>
  read.catch((error: unknown) => {
    if (NotFound.safeParse(error).success) return undefined
    throw error
  })

const buildSync = <Row extends object>(deps: {
  feed: ChangeFeed
  table: string
  loadRows: () => Promise<Row[]>
  readRow: (key: string) => Promise<Row>
  onReady: (params: SyncParams<Row>) => void
}): SyncConfig<Row, string> => {
  const {feed, table, loadRows, readRow, onReady} = deps
  return {
    rowUpdateMode: 'full',
    sync: (params) => {
      onReady(params)
      const write = (key: string, row: Row | undefined): void => {
        params.begin()
        if (!row) params.write({type: 'delete', key})
        if (row) params.write({type: params.collection.has(key) ? 'update' : 'insert', value: row})
        params.commit()
      }
      const load = async (replace: boolean): Promise<void> => {
        const loaded = await loadRows()
        params.begin()
        if (replace) params.truncate()
        loaded.forEach((row) => params.write({type: 'insert', value: row}))
        params.commit()
      }
      const apply = async (message: ChangeMessage): Promise<void> => {
        if (message.type === 'reload') return load(true)
        if (message.type === 'delete') return write(message.key, undefined)
        write(message.key, await readMissing(readRow(message.key)))
      }
      const queue = new AsyncQueuer(apply, {
        concurrency: 1,
        started: false,
        onError: (error) => console.error(`[whiteboard] a ${table} change could not be applied: ${String(error)}`),
      })
      const off = feed.subscribe(table, (message) => void queue.addItem(message))
      const start = async (): Promise<void> => {
        await feed.opened()
        await load(false)
      }
      void start()
        .catch((error: unknown) =>
          console.error(`[whiteboard] the ${table} rows could not be loaded: ${String(error)}`),
        )
        .finally(() => {
          params.markReady()
          queue.start()
        })
      return () => {
        off()
        queue.stop()
      }
    },
  }
}

type TableClient<Row extends {id: string}, Insert> = {
  list: () => Promise<Row[]>
  get: (id: string) => Promise<Row>
  insert: (row: Insert) => Promise<Row>
  update: (id: string, patch: Partial<Row>) => Promise<Row>
  remove: (id: string) => Promise<{deleted: boolean}>
}

export function whiteboardCollectionOptions<Row extends {id: string}, Insert>(deps: {
  feed: ChangeFeed
  room: string
  table: string
  ops: TableClient<Row, Insert>
  toInsert: (row: Row) => Insert
  onWriteFailed: (error: unknown) => void
}) {
  const {feed, room, table, ops, toInsert, onWriteFailed} = deps
  const sync: {params?: SyncParams<Row>} = {}

  const confirm = (row: Row): void => {
    const params = sync.params
    if (!params) return
    params.begin({immediate: true})
    params.write({type: params.collection.has(row.id) ? 'update' : 'insert', value: row})
    params.commit()
  }
  const reported = (write: () => Promise<void>): Promise<{refetch: false}> =>
    write().then(
      () => ({refetch: false}),
      (error: unknown) => {
        onWriteFailed(error)
        throw error
      },
    )
  const confirmDelete = (key: string): void => {
    const params = sync.params
    if (!params) return
    params.begin({immediate: true})
    params.write({type: 'delete', key})
    params.commit()
  }

  return {
    id: `${table}:${room}`,
    getKey: (row: Row) => row.id,
    sync: buildSync<Row>({
      feed,
      table,
      loadRows: ops.list,
      readRow: ops.get,
      onReady: (params) => void (sync.params = params),
    }),
    onInsert: ({transaction}: InsertMutationFnParams<Row, string>) =>
      reported(async () => {
        for (const mutation of transaction.mutations) {
          confirm(await ops.insert(toInsert(mutation.modified)))
        }
      }),
    onUpdate: ({transaction}: UpdateMutationFnParams<Row, string>) =>
      reported(async () => {
        for (const mutation of transaction.mutations) {
          confirm(await ops.update(String(mutation.key), mutation.changes))
        }
      }),
    onDelete: ({transaction}: DeleteMutationFnParams<Row, string>) =>
      reported(async () => {
        for (const mutation of transaction.mutations) {
          await ops.remove(String(mutation.key))
          confirmDelete(String(mutation.key))
        }
      }),
  }
}

type ElementClient = {
  list: () => Promise<ElementRow[]>
  get: (elementId: string) => Promise<ElementRow>
  upsert: (row: ElementRow) => Promise<ElementRow>
  bulkUpsert: (rows: ElementRow[]) => Promise<{rows: ElementRow[]}>
  bulkDelete: (elementIds: string[]) => Promise<{deleted: number}>
}

export function whiteboardElementOptions(deps: {
  feed: ChangeFeed
  room: string
  scope: 'live' | 'draft'
  ops: ElementClient
}) {
  const {feed, room, scope, ops} = deps
  const table = scope === 'draft' ? 'canvasDraftElements' : 'canvasElements'
  const sync: {params?: SyncParams<ElementRow>} = {}

  const confirm = (row: ElementRow): void => {
    const params = sync.params
    if (!params) return
    params.begin({immediate: true})
    params.write({type: params.collection.has(row.elementId) ? 'update' : 'insert', value: row})
    params.commit()
  }
  const putElement = async (row: ElementRow): Promise<void> => {
    const stored = await ops.upsert(row).catch((error: unknown) => {
      const conflict = Conflict.safeParse(error)
      if (conflict.success) return conflict.data.data.current
      throw error
    })
    confirm(stored)
  }

  const strategy = throttleStrategy({wait: ELEMENT_WRITE_THROTTLE_MS, leading: true, trailing: true})
  const pacedWrite = createPacedMutations<ElementRow, ElementRow>({
    strategy,
    onMutate: (row) => {
      const params = sync.params
      if (!params) return
      if (params.collection.has(row.elementId))
        return void params.collection.update(row.elementId, (draft) => {
          draft.data = row.data
          draft.version = row.version
        })
      params.collection.insert(row)
    },
    mutationFn: async ({transaction}) => {
      const modified = transaction.mutations.map((mutation) => mutation.modified)
      const [first] = modified
      if (modified.length === 1 && first) return void (await putElement(first))
      const {rows} = await ops.bulkUpsert(modified)
      rows.forEach(confirm)
    },
  })

  return {
    id: `${table}:${room}`,
    getKey: (row: ElementRow) => row.elementId,
    sync: buildSync<ElementRow>({
      feed,
      table,
      loadRows: ops.list,
      readRow: ops.get,
      onReady: (params) => void (sync.params = params),
    }),
    onDelete: async ({transaction}: DeleteMutationFnParams<ElementRow, string>) => {
      await ops.bulkDelete(transaction.mutations.map((mutation) => String(mutation.key)))
      return {refetch: false}
    },
    utils: {
      write: (row: ElementRow) => pacedWrite(row),
      cleanupStrategy: strategy.cleanup,
    },
  }
}
