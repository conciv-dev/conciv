import {Rpc} from '@conciv/plugin/rpc'
import {z} from 'zod'
import {
  commentRow,
  commentRowInsert,
  cursorEvent,
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
} from './rows.js'

const Room = z.string().regex(/^ses_[A-Za-z0-9_-]{1,128}$/)
const RoomInput = z.object({room: Room})
const ScopeInput = RoomInput.extend({scope: z.enum(['live', 'draft'])})
const IdInput = RoomInput.extend({id: z.string()})
const DeletedOutput = z.object({deleted: z.boolean()})
const notFound = {NOT_FOUND: z.object({id: z.string()})}
const conflict = {CONFLICT: z.object({current: elementRow})}
const ChangeTable = z.enum([
  'canvasElements',
  'canvasDraftElements',
  'canvasPending',
  'canvasReplies',
  'comments',
  'pins',
  'reads',
])
const ChangeType = z.enum(['upsert', 'delete'])
const Cursor = z.number().int().min(0)

const nonEmpty = <Patch extends z.ZodType<object>>(patch: Patch) =>
  patch.refine(
    (value) => Object.keys(value).length > 0,
    'an update patch must carry at least one mutable field; row identity and room come from the input',
  )

const list = <Row extends z.ZodType>(row: Row) => ({input: RoomInput, output: z.array(row)})

const insert = <Row extends z.ZodType, Insert extends z.ZodType>(row: Row, insertRow: Insert) => ({
  input: RoomInput.extend({row: insertRow}),
  output: row,
})

const update = <Row extends z.ZodType, Patch extends z.ZodType<object>>(row: Row, patch: Patch) => ({
  input: RoomInput.extend({id: z.string(), patch: nonEmpty(patch)}),
  output: row,
  errors: notFound,
})

const get = <Row extends z.ZodType>(row: Row) => ({input: IdInput, output: row, errors: notFound})

const remove = {input: IdInput, output: DeletedOutput}

const commentPatch = commentRow.omit({id: true, sessionId: true}).partial()
const pinPatch = pinRow.omit({id: true, room: true}).partial()
const readPatch = readRow.omit({id: true, sessionId: true}).partial()
const pendingPatch = pendingRow.omit({id: true, room: true}).partial()
const replyPatch = replyRow.omit({id: true, room: true}).partial()

export const Whiteboard = Rpc.define({
  id: 'whiteboard',
  methods: {
    'comments.list': list(commentRow),
    'comments.get': get(commentRow),
    'comments.insert': insert(commentRow, commentRowInsert),
    'comments.update': update(commentRow, commentPatch),
    'comments.remove': remove,
    'pins.list': list(pinRow),
    'pins.get': get(pinRow),
    'pins.insert': insert(pinRow, pinRowInsert),
    'pins.update': update(pinRow, pinPatch),
    'pins.remove': remove,
    'reads.list': list(readRow),
    'reads.get': get(readRow),
    'reads.insert': insert(readRow, readRowInsert),
    'reads.update': update(readRow, readPatch),
    'reads.remove': remove,
    'canvasPending.list': list(pendingRow),
    'canvasPending.get': get(pendingRow),
    'canvasPending.insert': insert(pendingRow, pendingRowInsert),
    'canvasPending.update': update(pendingRow, pendingPatch),
    'canvasPending.remove': remove,
    'canvasPending.claim': {input: IdInput, output: z.object({claimed: z.boolean()})},
    'canvasReplies.list': list(replyRow),
    'canvasReplies.get': get(replyRow),
    'canvasReplies.insert': insert(replyRow, replyRowInsert),
    'canvasReplies.update': update(replyRow, replyPatch),
    'canvasReplies.remove': remove,
    'elements.list': {input: ScopeInput, output: z.array(elementRow)},
    'elements.get': {input: ScopeInput.extend({elementId: z.string()}), output: elementRow, errors: notFound},
    'elements.upsert': {input: ScopeInput.extend({row: elementRowInsert}), output: elementRow, errors: conflict},
    'elements.bulkUpsert': {
      input: ScopeInput.extend({rows: z.array(elementRowInsert)}),
      output: z.object({rows: z.array(elementRow)}),
    },
    'elements.bulkDelete': {
      input: ScopeInput.extend({elementIds: z.array(z.string())}),
      output: z.object({deleted: z.number()}),
    },
    'cursor.move': {input: RoomInput.extend({cursor: cursorEventInsert}), output: z.object({ok: z.literal(true)})},
    since: {
      input: RoomInput.extend({cursor: Cursor}),
      output: z.object({
        changes: z.array(z.object({table: ChangeTable, key: z.string(), type: ChangeType, cursor: Cursor})),
        cursor: Cursor,
      }),
    },
  },
  events: {
    cursor: {schema: cursorEvent},
    changed: {
      schema: z.object({room: Room, table: ChangeTable, key: z.string(), type: ChangeType, cursor: Cursor}),
    },
  },
})
