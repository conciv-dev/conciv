import {eq} from 'drizzle-orm'
import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {subscriptionIterator} from '@conciv/extension'
import {SessionId} from '@conciv/protocol/chat-types'
import {commentRow, cursorEvent, elementRow, pendingRow, pinRow, readRow, replyRow} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store, WhiteboardEvent} from './db/store.js'

const wbOs = os.$context<{request: Request}>()

const roomInput = z.object({room: SessionId})
const scopeInput = z.object({scope: z.enum(['live', 'draft'])})
const notFound = {NOT_FOUND: {message: 'row not found'}}

type TableOps<Row extends object> = {
  list: (room: SessionId) => Promise<Row[]>
  insert: (row: Row) => Promise<Row>
  update: (id: string, room: SessionId, patch: Partial<Row>) => Promise<Row | undefined>
  remove: (id: string, room: SessionId) => Promise<boolean>
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
      .input(roomInput.extend({id: z.string(), patch: patchSchema}))
      .output(schema)
      .handler(async ({input, errors}) => {
        const row = await ops.update(input.id, input.room, input.patch)
        if (!row) throw errors.NOT_FOUND()
        return row
      }),
    remove: wbOs
      .input(roomInput.extend({id: z.string()}))
      .output(z.object({deleted: z.boolean()}))
      .handler(async ({input}) => ({deleted: await ops.remove(input.id, input.room)})),
  }
}

export function makeWhiteboardRouter(store: Store) {
  const db = store.db
  return wbOs.router({
    comments: tableRouter(commentRow, commentRow.partial(), {
      list: (room) => db.select().from(comments).where(eq(comments.sessionId, room)),
      insert: (row) => store.insertComment(row),
      update: (id, room, patch) => store.updateComment(id, room, patch),
      remove: (id, room) => store.deleteComment(id, room),
    }),
    pins: tableRouter(pinRow, pinRow.partial(), {
      list: (room) => db.select().from(pins).where(eq(pins.room, room)),
      insert: (row) => store.insertPin(row),
      update: (id, room, patch) => store.updatePin(id, room, patch),
      remove: (id, room) => store.deletePin(id, room),
    }),
    reads: tableRouter(readRow, readRow.partial(), {
      list: (room) => db.select().from(reads).where(eq(reads.sessionId, room)),
      insert: (row) => store.insertRead(row),
      update: (id, room, patch) => store.updateRead(id, room, patch),
      remove: (id, room) => store.deleteRead(id, room),
    }),
    canvasPending: tableRouter(pendingRow, pendingRow.partial(), {
      list: (room) => db.select().from(canvasPending).where(eq(canvasPending.room, room)),
      insert: (row) => store.insertPending(row),
      update: (id, room, patch) => store.updatePending(id, room, patch),
      remove: (id, room) => store.deletePending(id, room),
    }),
    canvasReplies: tableRouter(replyRow, replyRow.partial(), {
      list: (room) => db.select().from(canvasReplies).where(eq(canvasReplies.room, room)),
      insert: (row) => store.insertReply(row),
      update: (id, room, patch) => store.updateReply(id, room, patch),
      remove: (id, room) => store.deleteReply(id, room),
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
        .input(scopeInput.extend(roomInput.shape).extend({elementIds: z.array(z.string())}))
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
