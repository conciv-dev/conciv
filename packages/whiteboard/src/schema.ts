import {z} from 'zod'

export type Comment = {
  cid: string
  preview_id: string
  session_id: string
  thread_id: string
  parent_id: string | null
  parts: unknown[]
  author_kind: 'human' | 'ai'
  author_model: string | null
  status: 'open' | 'resolved' | 'drifted' | 'orphaned'
  kind: 'source-linked' | 'floating'
  anchor: unknown | null
  anchor_file: string | null
  anchor_component: string | null
  anchor_hash: string | null
  last_resolved_commit: string | null
  last_resolved_file_hash: string | null
  created_at: Date
  updated_at: Date
  resolved_at: Date | null
  resolved_by: string | null
}

export type CommentRecord = {
  cid: string
  preview_id: string
  session_id: string
  thread_id: string
  parent_id: string | null
  parts: string
  author_kind: 'human' | 'ai'
  author_model: string | null
  status: 'open' | 'resolved' | 'drifted' | 'orphaned'
  kind: 'source-linked' | 'floating'
  anchor: string | null
  anchor_file: string | null
  anchor_component: string | null
  anchor_hash: string | null
  last_resolved_commit: string | null
  last_resolved_file_hash: string | null
  created_at: number
  updated_at: number
  resolved_at: number | null
  resolved_by: string | null
}

export const LIMITS = {partBytes: 16_384, threadReplies: 500, sessionComments: 2_000, snippetBytes: 2_048} as const

const byteLength = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length

const partsField = z
  .array(z.unknown())
  .superRefine((parts, ctx) =>
    parts.forEach((part, index) =>
      byteLength(part) > LIMITS.partBytes
        ? ctx.addIssue({code: 'custom', message: `part ${index} exceeds ${LIMITS.partBytes} bytes`, path: [index]})
        : undefined,
    ),
  )

export const CommentSchema: z.ZodType<Comment> = z.object({
  cid: z.string(),
  preview_id: z.string(),
  session_id: z.string(),
  thread_id: z.string(),
  parent_id: z.string().nullable(),
  parts: partsField,
  author_kind: z.enum(['human', 'ai']),
  author_model: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'drifted', 'orphaned']),
  kind: z.enum(['source-linked', 'floating']),
  anchor: z.unknown().nullable(),
  anchor_file: z.string().nullable(),
  anchor_component: z.string().nullable(),
  anchor_hash: z.string().nullable(),
  last_resolved_commit: z.string().nullable(),
  last_resolved_file_hash: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
  resolved_at: z.date().nullable(),
  resolved_by: z.string().nullable(),
})

const parseJson = (column: string, value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`comment.${column} is not valid JSON`)
  }
}

const toDate = (column: string, value: number): Date => {
  if (!Number.isFinite(value)) throw new Error(`comment.${column} is not a finite timestamp`)
  return new Date(value)
}

export const commentParse = {
  parts: (value: string): unknown[] => z.array(z.unknown()).parse(parseJson('parts', value)),
  anchor: (value: string | null): unknown => (value === null ? null : parseJson('anchor', value)),
  created_at: (value: number): Date => toDate('created_at', value),
  updated_at: (value: number): Date => toDate('updated_at', value),
  resolved_at: (value: number | null): Date | null => (value === null ? null : toDate('resolved_at', value)),
}

export const commentSerialize = {
  parts: (value: unknown[]): string => JSON.stringify(value),
  anchor: (value: unknown): string | null => (value === null || value === undefined ? null : JSON.stringify(value)),
  created_at: (value: Date): number => value.getTime(),
  updated_at: (value: Date): number => value.getTime(),
  resolved_at: (value: Date | null): number | null => (value === null ? null : value.getTime()),
}

export const COMMENT_COLUMNS = [
  'preview_id TEXT NOT NULL',
  'session_id TEXT NOT NULL',
  'thread_id TEXT NOT NULL',
  'parent_id TEXT',
  'parts TEXT NOT NULL',
  'author_kind TEXT NOT NULL',
  'author_model TEXT',
  'status TEXT NOT NULL',
  'kind TEXT NOT NULL',
  'anchor TEXT',
  'anchor_file TEXT',
  'anchor_component TEXT',
  'anchor_hash TEXT',
  'last_resolved_commit TEXT',
  'last_resolved_file_hash TEXT',
  'created_at INTEGER NOT NULL',
  'updated_at INTEGER NOT NULL',
  'resolved_at INTEGER',
  'resolved_by TEXT',
].join(',\n  ')
