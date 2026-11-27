import {createPacedMutations, throttleStrategy} from '@tanstack/solid-db'
import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  SyncConfig,
  UpdateMutationFnParams,
} from '@tanstack/solid-db'
import {Effect, Fiber, Option, Ref, Stream} from 'effect'
import type {WhiteboardRuntime} from './solid-runtime.js'
import {z} from 'zod'
import {elementRow, type ElementRow} from './rows.js'
import type {ChangeFeed, ChangeMessage} from './change-feed.js'
import {canvasErrors} from './errors/canvas-errors.js'

const ELEMENT_WRITE_THROTTLE_MS = 50

const NotFound = z.object({type: z.literal('NOT_FOUND')})
const Conflict = z.object({type: z.literal('CONFLICT'), data: z.object({current: elementRow})})

type SyncParams<Row extends object> = Parameters<SyncConfig<Row, string>['sync']>[0]

type Confirmed<Row extends object> =
  | {readonly type: 'write'; readonly row: Row}
  | {readonly type: 'delete'; readonly key: string}

const written = {refetch: false} as const

const callRpc = <A>(call: () => Promise<A>) => Effect.tryPromise({try: call, catch: (cause) => cause})

function confirmRows<Row extends object>(
  params: Ref.Ref<Option.Option<SyncParams<Row>>>,
  readKey: (row: Row) => string,
  confirmed: readonly Confirmed<Row>[],
): Effect.Effect<void> {
  return Ref.get(params).pipe(
    Effect.map(
      Option.map((sync) => {
        sync.begin({immediate: true})
        for (const entry of confirmed) {
          if (entry.type === 'delete') sync.write({type: 'delete', key: entry.key})
          else sync.write({type: sync.collection.has(readKey(entry.row)) ? 'update' : 'insert', value: entry.row})
        }
        sync.commit()
      }),
    ),
  )
}

const readRows = <Row>(read: () => Promise<Row>) =>
  Effect.tryPromise({
    try: read,
    catch: (cause) =>
      NotFound.safeParse(cause).success
        ? canvasErrors.ROW_MISSING()
        : canvasErrors.ROWS_UNREADABLE({cause: cause instanceof Error ? cause : undefined}),
  })

const buildSync = <Row extends object>(deps: {
  runtime: WhiteboardRuntime
  feed: ChangeFeed
  table: string
  loadRows: () => Promise<Row[]>
  readRow: (key: string) => Promise<Row>
  onReady: (params: SyncParams<Row>) => void
}): SyncConfig<Row, string> => {
  const {runtime, feed, table, loadRows, readRow, onReady} = deps
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
      const load = (replace: boolean) =>
        readRows(loadRows).pipe(
          Effect.map((loaded) => {
            params.begin()
            if (replace) params.truncate()
            loaded.forEach((row) => params.write({type: 'insert', value: row}))
            params.commit()
          }),
        )
      const apply = (message: ChangeMessage) => {
        if (message.type === 'reload') return load(true)
        if (message.type === 'delete') return Effect.sync(() => write(message.key, undefined))
        return readRows(() => readRow(message.key)).pipe(
          Effect.catchIf(
            (error) => error.code === canvasErrors.ROW_MISSING.code,
            () => Effect.succeed(undefined),
          ),
          Effect.map((row) => write(message.key, row)),
        )
      }
      const consume = Effect.gen(function* () {
        const messages = yield* feed.follow(table)
        yield* feed.opened
        yield* load(false).pipe(
          Effect.catch((failure) => Effect.logError(`the ${table} rows could not be loaded`, failure)),
        )
        params.markReady()
        yield* Stream.runForEach(messages, (message) =>
          apply(message).pipe(
            Effect.catch((failure) => Effect.logError(`a ${table} change could not be applied`, failure)),
          ),
        )
      }).pipe(Effect.scoped)
      const consumer = runtime.runFork(consume)
      return () => void runtime.runFork(Fiber.interrupt(consumer))
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
  runtime: WhiteboardRuntime
  feed: ChangeFeed
  room: string
  table: string
  ops: TableClient<Row, Insert>
  toInsert: (row: Row) => Insert
  onWriteFailed: (error: unknown) => void
}) {
  const {runtime, feed, room, table, ops, toInsert, onWriteFailed} = deps
  const params = Ref.makeUnsafe<Option.Option<SyncParams<Row>>>(Option.none())
  const confirm = (entry: Confirmed<Row>) => confirmRows(params, (row: Row) => row.id, [entry])
  const reported = <Mutation>(
    mutations: readonly Mutation[],
    save: (mutation: Mutation) => Effect.Effect<Confirmed<Row>, unknown>,
  ) =>
    runtime.runPromise(
      Effect.forEach(mutations, (mutation) => Effect.flatMap(save(mutation), confirm), {discard: true}).pipe(
        Effect.tapError((error) => Effect.sync(() => onWriteFailed(error))),
        Effect.as(written),
      ),
    )

  return {
    id: `${table}:${room}`,
    getKey: (row: Row) => row.id,
    sync: buildSync<Row>({
      runtime,
      feed,
      table,
      loadRows: ops.list,
      readRow: ops.get,
      onReady: (ready) => runtime.runSync(Ref.set(params, Option.some(ready))),
    }),
    onInsert: ({transaction}: InsertMutationFnParams<Row, string>) =>
      reported(transaction.mutations, (mutation) =>
        callRpc(() => ops.insert(toInsert(mutation.modified))).pipe(
          Effect.map((row) => ({type: 'write', row}) as const),
        ),
      ),
    onUpdate: ({transaction}: UpdateMutationFnParams<Row, string>) =>
      reported(transaction.mutations, (mutation) =>
        callRpc(() => ops.update(String(mutation.key), mutation.changes)).pipe(
          Effect.map((row) => ({type: 'write', row}) as const),
        ),
      ),
    onDelete: ({transaction}: DeleteMutationFnParams<Row, string>) =>
      reported(transaction.mutations, (mutation) =>
        callRpc(() => ops.remove(String(mutation.key))).pipe(
          Effect.as({type: 'delete', key: String(mutation.key)} as const),
        ),
      ),
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
  runtime: WhiteboardRuntime
  feed: ChangeFeed
  room: string
  scope: 'live' | 'draft'
  ops: ElementClient
}) {
  const {runtime, feed, room, scope, ops} = deps
  const table = scope === 'draft' ? 'canvasDraftElements' : 'canvasElements'
  const params = Ref.makeUnsafe<Option.Option<SyncParams<ElementRow>>>(Option.none())
  const confirm = (rows: readonly ElementRow[]) =>
    confirmRows(
      params,
      (row: ElementRow) => row.elementId,
      rows.map((row) => ({type: 'write', row}) as const),
    )
  const putElement = (row: ElementRow) =>
    callRpc(() => ops.upsert(row)).pipe(
      Effect.catch((error) => {
        const conflict = Conflict.safeParse(error)
        return conflict.success ? Effect.succeed(conflict.data.data.current) : Effect.fail(error)
      }),
      Effect.flatMap((stored) => confirm([stored])),
    )

  const strategy = throttleStrategy({wait: ELEMENT_WRITE_THROTTLE_MS, leading: true, trailing: true})
  const pacedWrite = createPacedMutations<ElementRow, ElementRow>({
    strategy,
    onMutate: (row) => {
      const sync = Option.getOrUndefined(Ref.getUnsafe(params))
      if (!sync) return
      if (sync.collection.has(row.elementId))
        return void sync.collection.update(row.elementId, (draft) => {
          draft.data = row.data
          draft.version = row.version
        })
      sync.collection.insert(row)
    },
    mutationFn: ({transaction}) => {
      const modified = transaction.mutations.map((mutation) => mutation.modified)
      const [first] = modified
      return runtime.runPromise(
        modified.length === 1 && first
          ? putElement(first)
          : callRpc(() => ops.bulkUpsert(modified)).pipe(Effect.flatMap(({rows}) => confirm(rows))),
      )
    },
  })

  return {
    id: `${table}:${room}`,
    getKey: (row: ElementRow) => row.elementId,
    sync: buildSync<ElementRow>({
      runtime,
      feed,
      table,
      loadRows: ops.list,
      readRow: ops.get,
      onReady: (ready) => runtime.runSync(Ref.set(params, Option.some(ready))),
    }),
    onDelete: ({transaction}: DeleteMutationFnParams<ElementRow, string>) =>
      runtime.runPromise(
        callRpc(() => ops.bulkDelete(transaction.mutations.map((mutation) => String(mutation.key)))).pipe(
          Effect.as(written),
        ),
      ),
    utils: {
      write: (row: ElementRow) => pacedWrite(row),
      cleanupStrategy: strategy.cleanup,
    },
  }
}
