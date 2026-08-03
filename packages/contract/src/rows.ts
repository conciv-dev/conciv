import {z} from 'zod'
import {NativeSessionRefSchema} from '@conciv/protocol/chat-types'
import {UsageSnapshotSchema} from '@conciv/protocol/usage-types'

export {UsageSnapshotSchema}
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>

export const SessionMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messageCount: z.number(),
  running: z.boolean(),
  origin: z.enum(['conciv', 'external']),
  usage: UsageSnapshotSchema.nullable(),
  model: z.string().nullable(),
  hidden: z.boolean(),
  native: NativeSessionRefSchema.nullable(),
})
export type SessionMeta = z.infer<typeof SessionMetaSchema>

export const DraftRowSchema = z.object({
  sessionId: z.string(),
  text: z.string(),
  selectionStart: z.number().int().min(0),
  selectionEnd: z.number().int().min(0),
  grabs: z.array(z.string()),
  updatedAt: z.number(),
})
export type DraftRow = z.infer<typeof DraftRowSchema>

export const MarkerKindSchema = z.enum(['new', 'compact'])
export const MarkerRowSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  afterTurn: z.number().int().min(0),
  kind: MarkerKindSchema,
})
export type MarkerRow = z.infer<typeof MarkerRowSchema>
