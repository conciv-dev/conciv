import {eq} from 'drizzle-orm'
import {eventIterator, ORPCError, os} from '@orpc/server'
import {z} from 'zod'
import {subscriptionIterator} from '@conciv/extension'
import {CONCIV_SESSION_HEADER, isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {commentRow, cursorEvent, elementRow, pendingRow, pinRow, readRow, replyRow} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store, WhiteboardEvent} from './db/store.js'

function serverRoom(context: RpcContext): SessionId {
  const raw = rpcHeader(context, CONCIV_SESSION_HEADER)?.trim()
  if (!raw) {
    throw new ORPCError('UNAUTHORIZED', {message: `the ${CONCIV_SESSION_HEADER} header is required`})
  }
  if (!isSessionId(raw)) {
    throw new ORPCError('BAD_REQUEST', {message: `the ${CONCIV_SESSION_HEADER} header carries a malformed session id`})
  }
  return raw
}

const wbOs = os.$context<RpcContext>()
const roomOs = wbOs.use(({context, next}) => next({context: {room: serverRoom(context)}}))

const scopeInput = z.object({scope: z.enum(['live', 'draft'])})
const notFound = {NOT_FOUND: {message: 'row not found'}}
const wrongRoom = {FORBIDDEN: {message: 'the row belongs to another session'}}

type TableOps<Row extends object> = {
  roomOf: (row: Row) => string
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
    list: roomOs.output(z.array(schema)).handler(({context}) => ops.list(context.room)),
    insert: roomOs
      .errors(wrongRoom)
      .input(schema)
      .output(schema)
      .handler(({input, context, errors}) => {
        if (ops.roomOf(input) !== context.room) throw errors.FORBIDDEN()
        return ops.insert(input)
      }),
    update: roomOs
      .errors(notFound)
      .input(z.object({id: z.string(), patch: patchSchema}))
      .output(schema)
      .handler(async ({input, context, errors}) => {
        const row = await ops.update(input.id, context.room, input.patch)
        if (!row) throw errors.NOT_FOUND()
        return row
      }),
    remove: roomOs
      .input(z.object({id: z.string()}))
      .output(z.object({deleted: z.boolean()}))
      .handler(async ({input, context}) => ({deleted: await ops.remove(input.id, context.room)})),
  }
}

export function makeWhiteboardRouter(store: Store) {
  const db = store.db
  return wbOs.router({
    comments: tableRouter(commentRow, commentRow.partial(), {
      roomOf: (row) => row.sessionId,
      list: (room) => db.select().from(comments).where(eq(comments.sessionId, room)),
      insert: (row) => store.insertComment(row),
      update: (id, room, patch) => store.updateComment(id, room, patch),
      remove: (id, room) => store.deleteComment(id, room),
    }),
    pins: tableRouter(pinRow, pinRow.partial(), {
      roomOf: (row) => row.room,
      list: (room) => db.select().from(pins).where(eq(pins.room, room)),
      insert: (row) => store.insertPin(row),
      update: (id, room, patch) => store.updatePin(id, room, patch),
      remove: (id, room) => store.deletePin(id, room),
    }),
    reads: tableRouter(readRow, readRow.partial(), {
      roomOf: (row) => row.sessionId,
      list: (room) => db.select().from(reads).where(eq(reads.sessionId, room)),
      insert: (row) => store.insertRead(row),
      update: (id, room, patch) => store.updateRead(id, room, patch),
      remove: (id, room) => store.deleteRead(id, room),
    }),
    canvasPending: tableRouter(pendingRow, pendingRow.partial(), {
      roomOf: (row) => row.room,
      list: (room) => db.select().from(canvasPending).where(eq(canvasPending.room, room)),
      insert: (row) => store.insertPending(row),
      update: (id, room, patch) => store.updatePending(id, room, patch),
      remove: (id, room) => store.deletePending(id, room),
    }),
    canvasReplies: tableRouter(replyRow, replyRow.partial(), {
      roomOf: (row) => row.room,
      list: (room) => db.select().from(canvasReplies).where(eq(canvasReplies.room, room)),
      insert: (row) => store.insertReply(row),
      update: (id, room, patch) => store.updateReply(id, room, patch),
      remove: (id, room) => store.deleteReply(id, room),
    }),
    elements: {
      list: roomOs
        .input(scopeInput)
        .output(z.array(elementRow))
        .handler(({input, context}) => store.listElements(input.scope, context.room)),
      upsert: roomOs
        .errors({
          ...wrongRoom,
          CONFLICT: {message: 'element version conflict', data: z.object({current: elementRow})},
        })
        .input(scopeInput.extend({row: elementRow}))
        .output(elementRow)
        .handler(async ({input, context, errors}) => {
          if (input.row.room !== context.room) throw errors.FORBIDDEN()
          const outcome = await store.upsertElement(input.scope, input.row)
          if (!outcome.ok) throw errors.CONFLICT({data: {current: outcome.current}})
          return outcome.row
        }),
      bulkUpsert: roomOs
        .errors(wrongRoom)
        .input(scopeInput.extend({rows: z.array(elementRow)}))
        .output(z.object({rows: z.array(elementRow)}))
        .handler(async ({input, context, errors}) => {
          if (input.rows.some((row) => row.room !== context.room)) throw errors.FORBIDDEN()
          return {rows: await store.upsertElements(input.scope, input.rows)}
        }),
      bulkDelete: roomOs
        .input(scopeInput.extend({elementIds: z.array(z.string())}))
        .output(z.object({deleted: z.number()}))
        .handler(async ({input, context}) => ({
          deleted: await store.deleteElements(input.scope, context.room, input.elementIds),
        })),
    },
    cursor: roomOs
      .errors(wrongRoom)
      .input(cursorEvent)
      .output(z.object({ok: z.literal(true)}))
      .handler(({input, context, errors}) => {
        if (input.room !== context.room) throw errors.FORBIDDEN()
        store.cursor(input)
        return {ok: true as const}
      }),
    changes: roomOs.output(eventIterator(z.custom<WhiteboardEvent>())).handler(async function* ({context, signal}) {
      yield* subscriptionIterator<WhiteboardEvent>(
        (emit) =>
          store.onEvent((event) => {
            if (event.room === context.room) emit(event)
          }),
        signal,
      )
    }),
  })
}

export type WhiteboardRouter = ReturnType<typeof makeWhiteboardRouter>
