import {eq} from 'drizzle-orm'
import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {subscriptionIterator} from '@conciv/extension'
import {commentRow, cursorEvent, elementRow, pendingRow, pinRow, readRow, replyRow} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store, WhiteboardEvent} from './db/store.js'

const wbOs = os.$context<{request: Request}>()

const roomInput = z.object({room: z.string().min(1)})
const scopeInput = z.object({scope: z.enum(['live', 'draft'])})
const notFound = {NOT_FOUND: {message: 'row not found'}}

type TableOps<Row extends object> = {
  list: (room: string) => Promise<Row[]>
  insert: (row: Row) => Promise<Row>
  update: (id: string, patch: Partial<Row>) => Promise<Row | undefined>
  remove: (id: string) => Promise<boolean>
}

function tableRouter<RowInput, PatchInput, Row extends RowInput & {id: string}>(
  schema: z.ZodType<Row, RowInput>,
  patchSchema: z.ZodType<Partial<Row>, PatchInput>,
  ops: TableOps<Row>,
) {
  return {
    list: wbOs
      .input(roomInput)
      .output(z.array(schema))
      .handler(({input}) => ops.list(input.room)),
    insert: wbOs
      .input(schema)
      .output(schema)
      .handler(({input}) => ops.insert(input)),
    update: wbOs
      .errors(notFound)
      .input(z.object({id: z.string(), patch: patchSchema}))
      .output(schema)
      .handler(async ({input, errors}) => {
        const row = await ops.update(input.id, input.patch)
        if (!row) throw errors.NOT_FOUND()
        return row
      }),
    remove: wbOs
      .input(z.object({id: z.string()}))
      .output(z.object({deleted: z.boolean()}))
      .handler(async ({input}) => ({deleted: await ops.remove(input.id)})),
  }
}

export function makeWhiteboardRouter(store: Store) {
  const db = store.db
  return wbOs.router({
    comments: tableRouter(commentRow, commentRow.partial(), {
      list: (room) => db.select().from(comments).where(eq(comments.sessionId, room)),
      insert: (row) => store.insertComment(row),
      update: (id, patch) => store.updateComment(id, patch),
      remove: (id) => store.deleteComment(id),
    }),
    pins: tableRouter(pinRow, pinRow.partial(), {
      list: (room) => db.select().from(pins).where(eq(pins.room, room)),
      insert: (row) => store.insertPin(row),
      update: (id, patch) => store.updatePin(id, patch),
      remove: (id) => store.deletePin(id),
    }),
    reads: tableRouter(readRow, readRow.partial(), {
      list: (room) => db.select().from(reads).where(eq(reads.sessionId, room)),
      insert: (row) => store.insertRead(row),
      update: (id, patch) => store.updateRead(id, patch),
      remove: (id) => store.deleteRead(id),
    }),
    canvasPending: tableRouter(pendingRow, pendingRow.partial(), {
      list: (room) => db.select().from(canvasPending).where(eq(canvasPending.room, room)),
      insert: (row) => store.insertPending(row),
      update: (id, patch) => store.updatePending(id, patch),
      remove: (id) => store.deletePending(id),
    }),
    canvasReplies: tableRouter(replyRow, replyRow.partial(), {
      list: (room) => db.select().from(canvasReplies).where(eq(canvasReplies.room, room)),
      insert: (row) => store.insertReply(row),
      update: (id, patch) => store.updateReply(id, patch),
      remove: (id) => store.deleteReply(id),
    }),
    elements: {
      list: wbOs
        .input(roomInput.extend(scopeInput.shape))
        .output(z.array(elementRow))
        .handler(({input}) => store.listElements(input.scope, input.room)),
      upsert: wbOs
        .errors({CONFLICT: {message: 'element version conflict', data: z.object({current: elementRow})}})
        .input(scopeInput.extend({row: elementRow}))
        .output(elementRow)
        .handler(async ({input, errors}) => {
          const outcome = await store.upsertElement(input.scope, input.row)
          if (!outcome.ok) throw errors.CONFLICT({data: {current: outcome.current}})
          return outcome.row
        }),
      bulkUpsert: wbOs
        .input(scopeInput.extend({rows: z.array(elementRow)}))
        .output(z.object({rows: z.array(elementRow)}))
        .handler(async ({input}) => ({rows: await store.upsertElements(input.scope, input.rows)})),
      bulkDelete: wbOs
        .input(scopeInput.extend({room: z.string(), elementIds: z.array(z.string())}))
        .output(z.object({deleted: z.number()}))
        .handler(async ({input}) => ({
          deleted: await store.deleteElements(input.scope, input.room, input.elementIds),
        })),
    },
    cursor: wbOs
      .input(cursorEvent)
      .output(z.object({ok: z.literal(true)}))
      .handler(({input}) => {
        store.cursor(input)
        return {ok: true as const}
      }),
    changes: wbOs
      .input(roomInput)
      .output(eventIterator(z.custom<WhiteboardEvent>()))
      .handler(async function* ({input, signal}) {
        yield* subscriptionIterator<WhiteboardEvent>(
          (emit) =>
            store.onEvent((event) => {
              if (event.room === input.room) emit(event)
            }),
          signal,
        )
      }),
  })
}

export type WhiteboardRouter = ReturnType<typeof makeWhiteboardRouter>
