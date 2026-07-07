import {z} from 'zod'

export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue}

export const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]),
)

export const elementRow = z.object({
  room: z.string(),
  elementId: z.string(),
  data: json,
  version: z.number().int(),
})

export const pendingRow = z.object({
  id: z.string(),
  room: z.string(),
  kind: z.enum(['skeletons', 'mermaid', 'svg', 'export', 'commit', 'discard']),
  stage: z.enum(['draft', 'live']),
  payload: json,
})

export const replyRow = z.object({
  id: z.string(),
  room: z.string(),
  requestId: z.string(),
  kind: z.enum(['export']),
  payload: json,
})

export const commentRow = z.object({
  id: z.string(),
  sessionId: z.string(),
  cid: z.string(),
  threadId: z.string(),
  parentId: z.string().nullable(),
  parts: json,
  authorKind: z.enum(['human', 'ai']),
  authorModel: z.string().nullable(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  authorAvatar: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'drifted', 'orphaned']),
  kind: z.enum(['source-linked', 'floating']),
  anchor: json.nullable(),
  anchorFile: z.string().nullable(),
  anchorComponent: z.string().nullable(),
  anchorHash: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  resolvedAt: z.number().int().nullable(),
})

export const pinRow = z.object({
  id: z.string(),
  room: z.string(),
  cid: z.string(),
  x: z.number(),
  y: z.number(),
  elementId: z.string().nullable(),
  pinState: z.enum(['locked', 'offset']),
  anchorX: z.number().nullable(),
  anchorY: z.number().nullable(),
})

export const readRow = z.object({
  id: z.string(),
  sessionId: z.string(),
  threadId: z.string(),
  accountId: z.string(),
  lastReadAt: z.number().int(),
})

export const cursorEvent = z.object({
  room: z.string(),
  peerId: z.string(),
  kind: z.enum(['human', 'agent']),
  x: z.number(),
  y: z.number(),
  name: z.string(),
  color: z.string(),
  lastSeen: z.number().int(),
})

export const changeOf = <Row extends z.ZodType>(row: Row) =>
  z.discriminatedUnion('type', [
    z.object({type: z.literal('upsert'), row}),
    z.object({type: z.literal('delete'), key: z.string()}),
  ])

export type ElementRow = z.infer<typeof elementRow>
export type PendingRow = z.infer<typeof pendingRow>
export type ReplyRow = z.infer<typeof replyRow>
export type CommentRow = z.infer<typeof commentRow>
export type PinRow = z.infer<typeof pinRow>
export type ReadRow = z.infer<typeof readRow>
export type CursorEvent = z.infer<typeof cursorEvent>
