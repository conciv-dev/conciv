import {eq} from 'drizzle-orm'
import {eventIterator, ORPCError, os, type ErrorMap, type Procedure, type Schema} from '@orpc/server'
import {z} from 'zod'
import {subscriptionIterator} from '@conciv/extension'
import {CONCIV_SESSION_HEADER, isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {
  commentRow,
  commentRowInsert,
  cursorEventInsert,
  elementRow,
  elementRowInsert,
  pendingRow,
  pendingRowInsert,
  pinRow,
  pinRowInsert,
  readRow,
  readRowInsert,
  replyRow,
  replyRowInsert,
} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {Store, WhiteboardEvent} from './db/store.js'

function serverRoom(context: RpcContext): SessionId {
  const raw = rpcHeader(context, CONCIV_SESSION_HEADER)?.trim()
  if (!raw) {
    throw new ORPCError('BAD_REQUEST', {message: `the ${CONCIV_SESSION_HEADER} header is required`})
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
const conflict = {CONFLICT: {message: 'element version conflict', data: z.object({current: elementRow})}}
const RemoveInput = z.object({id: z.string()})
const DeletedOutput = z.object({deleted: z.boolean()})
const ElementsOutput = z.array(elementRow)
const UpsertInput = scopeInput.extend({row: elementRowInsert})
const BulkUpsertInput = scopeInput.extend({rows: z.array(elementRowInsert)})
const BulkUpsertOutput = z.object({rows: z.array(elementRow)})
const BulkDeleteInput = scopeInput.extend({elementIds: z.array(z.string())})
const BulkDeleteOutput = z.object({deleted: z.number()})
const OkOutput = z.object({ok: z.literal(true)})
const commentPatch = commentRow.omit({id: true, sessionId: true}).partial()
const pinPatch = pinRow.omit({id: true, room: true}).partial()
const readPatch = readRow.omit({id: true, sessionId: true}).partial()
const pendingPatch = pendingRow.omit({id: true, room: true}).partial()
const replyPatch = replyRow.omit({id: true, room: true}).partial()

type RoomProcedure<
  Input extends Schema<unknown, unknown>,
  Output extends Schema<unknown, unknown>,
  Errors extends ErrorMap = Record<never, never>,
> = Procedure<RpcContext, RpcContext & {room: SessionId}, Input, Output, Errors, Record<never, never>>
type TableRouter<Row extends z.ZodType, Insert extends z.ZodType, Patch extends z.ZodType> = {
  list: RoomProcedure<Schema<unknown, unknown>, z.ZodArray<z.ZodType<z.output<Row>, z.input<Row>>>>
  insert: RoomProcedure<z.ZodType<z.output<Insert>, z.input<Insert>>, z.ZodType<z.output<Row>, z.input<Row>>>
  update: RoomProcedure<
    z.ZodObject<{id: z.ZodString; patch: z.ZodType<Partial<z.output<Row>>, z.input<Patch>>}>,
    z.ZodType<z.output<Row>, z.input<Row>>,
    typeof notFound
  >
  remove: RoomProcedure<typeof RemoveInput, typeof DeletedOutput>
}
export type WhiteboardRouter = {
  comments: TableRouter<typeof commentRow, typeof commentRowInsert, typeof commentPatch>
  pins: TableRouter<typeof pinRow, typeof pinRowInsert, typeof pinPatch>
  reads: TableRouter<typeof readRow, typeof readRowInsert, typeof readPatch>
  canvasPending: TableRouter<typeof pendingRow, typeof pendingRowInsert, typeof pendingPatch>
  canvasReplies: TableRouter<typeof replyRow, typeof replyRowInsert, typeof replyPatch>
  elements: {
    list: RoomProcedure<typeof scopeInput, typeof ElementsOutput>
    upsert: RoomProcedure<typeof UpsertInput, typeof elementRow, typeof conflict>
    bulkUpsert: RoomProcedure<typeof BulkUpsertInput, typeof BulkUpsertOutput>
    bulkDelete: RoomProcedure<typeof BulkDeleteInput, typeof BulkDeleteOutput>
  }
  cursor: RoomProcedure<typeof cursorEventInsert, typeof OkOutput>
  changes: RoomProcedure<Schema<unknown, unknown>, ReturnType<typeof eventIterator<WhiteboardEvent, WhiteboardEvent>>>
}

type TableOps<Row extends object, Insert extends object> = {
  toRow: (input: Insert, room: SessionId) => Row
  list: (room: SessionId) => Promise<Row[]>
  insert: (row: Row) => Promise<Row>
  update: (id: string, room: SessionId, patch: Partial<Row>) => Promise<Row | undefined>
  remove: (id: string, room: SessionId) => Promise<boolean>
}

function tableRouter<RowInput, InsertInput, PatchInput, Row extends RowInput & {id: string}, Insert extends object>(
  schema: z.ZodType<Row, RowInput>,
  insertSchema: z.ZodType<Insert, InsertInput>,
  patchSchema: z.ZodType<Partial<Row>, PatchInput>,
  ops: TableOps<Row, Insert>,
) {
  return {
    list: roomOs.output(z.array(schema)).handler(({context}) => ops.list(context.room)),
    insert: roomOs
      .input(insertSchema)
      .output(schema)
      .handler(({input, context}) => ops.insert(ops.toRow(input, context.room))),
    update: roomOs
      .errors(notFound)
      .input(
        z
          .object({id: z.string(), patch: patchSchema})
          .refine(
            ({patch}) => Object.keys(patch).length > 0,
            'an update patch must carry at least one mutable field; row identity and room ownership are server-derived',
          ),
      )
      .output(schema)
      .handler(async ({input, context, errors}) => {
        const row = await ops.update(input.id, context.room, input.patch)
        if (!row) throw errors.NOT_FOUND()
        return row
      }),
    remove: roomOs
      .input(RemoveInput)
      .output(DeletedOutput)
      .handler(async ({input, context}) => ({deleted: await ops.remove(input.id, context.room)})),
  }
}

export function makeWhiteboardRouter(store: Store): WhiteboardRouter {
  const db = store.db
  return wbOs.router({
    comments: tableRouter(commentRow, commentRowInsert, commentPatch, {
      toRow: (input, room) => ({...input, sessionId: room}),
      list: (room) => db.select().from(comments).where(eq(comments.sessionId, room)),
      insert: (row) => store.insertComment(row),
      update: (id, room, patch) => store.updateComment(id, room, patch),
      remove: (id, room) => store.deleteComment(id, room),
    }),
    pins: tableRouter(pinRow, pinRowInsert, pinPatch, {
      toRow: (input, room) => ({...input, room}),
      list: (room) => db.select().from(pins).where(eq(pins.room, room)),
      insert: (row) => store.insertPin(row),
      update: (id, room, patch) => store.updatePin(id, room, patch),
      remove: (id, room) => store.deletePin(id, room),
    }),
    reads: tableRouter(readRow, readRowInsert, readPatch, {
      toRow: (input, room) => ({...input, sessionId: room}),
      list: (room) => db.select().from(reads).where(eq(reads.sessionId, room)),
      insert: (row) => store.insertRead(row),
      update: (id, room, patch) => store.updateRead(id, room, patch),
      remove: (id, room) => store.deleteRead(id, room),
    }),
    canvasPending: tableRouter(pendingRow, pendingRowInsert, pendingPatch, {
      toRow: (input, room) => ({...input, room}),
      list: (room) => db.select().from(canvasPending).where(eq(canvasPending.room, room)),
      insert: (row) => store.insertPending(row),
      update: (id, room, patch) => store.updatePending(id, room, patch),
      remove: (id, room) => store.deletePending(id, room),
    }),
    canvasReplies: tableRouter(replyRow, replyRowInsert, replyPatch, {
      toRow: (input, room) => ({...input, room}),
      list: (room) => db.select().from(canvasReplies).where(eq(canvasReplies.room, room)),
      insert: (row) => store.insertReply(row),
      update: (id, room, patch) => store.updateReply(id, room, patch),
      remove: (id, room) => store.deleteReply(id, room),
    }),
    elements: {
      list: roomOs
        .input(scopeInput)
        .output(ElementsOutput)
        .handler(({input, context}) => store.listElements(input.scope, context.room)),
      upsert: roomOs
        .errors(conflict)
        .input(UpsertInput)
        .output(elementRow)
        .handler(async ({input, context, errors}) => {
          const row = {...input.row, room: context.room}
          const outcome = await store.upsertElement(input.scope, row)
          if (!outcome.ok) throw errors.CONFLICT({data: {current: outcome.current}})
          return outcome.row
        }),
      bulkUpsert: roomOs
        .input(BulkUpsertInput)
        .output(BulkUpsertOutput)
        .handler(async ({input, context}) => {
          const rows = input.rows.map((row) => ({...row, room: context.room}))
          return {rows: await store.upsertElements(input.scope, rows)}
        }),
      bulkDelete: roomOs
        .input(BulkDeleteInput)
        .output(BulkDeleteOutput)
        .handler(async ({input, context}) => ({
          deleted: await store.deleteElements(input.scope, context.room, input.elementIds),
        })),
    },
    cursor: roomOs
      .input(cursorEventInsert)
      .output(OkOutput)
      .handler(({input, context}) => {
        store.cursor({...input, room: context.room})
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
