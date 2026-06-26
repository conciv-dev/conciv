import {z} from 'zod'
import {defineTool, type ToolDefinition, type ToolExecuteCtx} from '@mandarax/extensions'
import type {SyncEngine} from '@mandarax/protocol/sync-types'
import type {ServerCollection} from '@mandarax/protocol/db-types'
import {ORIGIN, PINS_KEY, roomId, type PinGeometry} from '../room.js'
import {commentParse, commentSerialize, LIMITS, type Comment, type CommentRecord} from '../schema.js'
import {loadResolver} from '../anchor/load-resolver.js'

const PickAnchor = z.object({
  source: z.object({file: z.string(), line: z.number(), column: z.number().nullable().optional()}),
})

type EnrichedAnchor = {anchor: unknown; file: string | null; component: string | null; hash: string | null}

// A source-linked anchor arrives as {source:{file,line,column}} from the pick (3.6). When the file
// resolves under the project root, enrich it into a full SourceAnchor (hash/salt/snippet) so the doctor
// can track drift; otherwise (missing file, no root) keep the raw source — never fail the create.
const enrichAnchor = async (cwd: string, raw: unknown): Promise<EnrichedAnchor> => {
  const parsed = PickAnchor.safeParse(raw)
  const fallback = (): EnrichedAnchor => ({anchor: raw ?? null, ...sourceOf(raw)})
  if (!parsed.success || cwd === '') return fallback()
  try {
    const resolver = await loadResolver(cwd)
    const captured = await resolver.capture({
      file: parsed.data.source.file,
      line: parsed.data.source.line,
      column: parsed.data.source.column ?? 1,
    })
    return {
      anchor: captured,
      file: captured.source.file,
      component: captured.source.component,
      hash: captured.source.hash,
    }
  } catch {
    return fallback()
  }
}

const AnchorSource = z.object({
  source: z.object({
    file: z.string().nullable().optional(),
    component: z.string().nullable().optional(),
    hash: z.string().nullable().optional(),
  }),
})

const sourceOf = (anchor: unknown): {file: string | null; component: string | null; hash: string | null} => {
  const parsed = AnchorSource.safeParse(anchor)
  if (!parsed.success) return {file: null, component: null, hash: null}
  return {
    file: parsed.data.source.file ?? null,
    component: parsed.data.source.component ?? null,
    hash: parsed.data.source.hash ?? null,
  }
}

const toComment = (record: CommentRecord): Comment => ({
  ...record,
  parts: commentParse.parts(record.parts),
  anchor: commentParse.anchor(record.anchor),
  created_at: commentParse.created_at(record.created_at),
  updated_at: commentParse.updated_at(record.updated_at),
  resolved_at: commentParse.resolved_at(record.resolved_at),
})

const loadRecord = async (comments: ServerCollection<CommentRecord>, cid: string): Promise<CommentRecord> => {
  const [row] = await comments.query({cid})
  if (!row) throw new Error(`comment ${cid} not found`)
  return row
}

const originFor = (author: 'human' | 'ai'): string => (author === 'ai' ? ORIGIN.AI : ORIGIN.USER)

const roomOf = (sync: SyncEngine, ctx: ToolExecuteCtx | undefined) =>
  sync.room(roomId(ctx?.previewId ?? '', ctx?.sessionId ?? ''))

const setPin = (sync: SyncEngine, ctx: ToolExecuteCtx | undefined, pin: PinGeometry, author: 'human' | 'ai'): void => {
  const room = roomOf(sync, ctx)
  room.doc.transact(() => room.doc.getMap<PinGeometry>(PINS_KEY).set(pin.cid, pin), originFor(author))
}

const dropPin = (sync: SyncEngine, ctx: ToolExecuteCtx | undefined, cid: string): void => {
  const room = roomOf(sync, ctx)
  room.doc.transact(() => room.doc.getMap<PinGeometry>(PINS_KEY).delete(cid), ORIGIN.USER)
}

const patchPin = (
  sync: SyncEngine,
  ctx: ToolExecuteCtx | undefined,
  cid: string,
  patch: Partial<PinGeometry>,
): void => {
  const room = roomOf(sync, ctx)
  const pins = room.doc.getMap<PinGeometry>(PINS_KEY)
  const current = pins.get(cid)
  if (!current) throw new Error(`no pin for comment ${cid}`)
  room.doc.transact(() => pins.set(cid, {...current, ...patch}), ORIGIN.USER)
}

export function createCommentTools(
  comments: ServerCollection<CommentRecord>,
  sync: SyncEngine,
  cwd: string,
): ToolDefinition[] {
  const create = defineTool({
    name: 'comment.create',
    label: 'Create comment',
    description: 'Pin a comment to the canvas, optionally anchored to a source element.',
    parameters: z.object({
      cid: z.string(),
      kind: z.enum(['source-linked', 'floating']),
      parts: z.array(z.unknown()),
      anchor: z.unknown().optional(),
      x: z.number(),
      y: z.number(),
      elementId: z.string().nullable().optional(),
      author_kind: z.enum(['human', 'ai']),
      author_model: z.string().nullable().optional(),
    }),
    promptSnippet: 'Use comment.create to leave a pinned note on the canvas for the user to see.',
    execute: async (input, ctx) => {
      const now = Date.now()
      const enriched = await enrichAnchor(cwd, input.anchor ?? null)
      const record: CommentRecord = {
        cid: input.cid,
        preview_id: ctx?.previewId ?? '',
        session_id: ctx?.sessionId ?? '',
        thread_id: input.cid,
        parent_id: null,
        parts: commentSerialize.parts(input.parts),
        author_kind: input.author_kind,
        author_model: input.author_model ?? null,
        status: 'open',
        kind: input.kind,
        anchor: commentSerialize.anchor(enriched.anchor),
        anchor_file: enriched.file,
        anchor_component: enriched.component,
        anchor_hash: enriched.hash,
        last_resolved_commit: null,
        last_resolved_file_hash: null,
        created_at: now,
        updated_at: now,
        resolved_at: null,
        resolved_by: null,
      }
      await comments.insert(record)
      setPin(
        sync,
        ctx,
        {cid: input.cid, x: input.x, y: input.y, elementId: input.elementId ?? null, pinState: 'locked'},
        input.author_kind,
      )
      return {cid: input.cid}
    },
  })

  const remove = defineTool({
    name: 'comment.delete',
    label: 'Delete comment',
    description: 'Remove a comment and its canvas pin.',
    parameters: z.object({cid: z.string()}),
    promptSnippet: 'Use comment.delete to remove a comment the user no longer wants.',
    execute: async (input, ctx) => {
      await comments.delete(input.cid)
      dropPin(sync, ctx, input.cid)
      return {cid: input.cid, deleted: true}
    },
  })

  const reply = defineTool({
    name: 'comment.reply',
    label: 'Reply to comment',
    description: 'Add a threaded reply to an existing comment.',
    parameters: z.object({
      cid: z.string(),
      parts: z.array(z.unknown()),
      author_kind: z.enum(['human', 'ai']).optional(),
      author_model: z.string().nullable().optional(),
    }),
    promptSnippet: 'Use comment.reply to answer a comment; the reply joins the same thread.',
    execute: async (input, ctx) => {
      const parent = await loadRecord(comments, input.cid)
      const now = Date.now()
      const replyCid = crypto.randomUUID()
      await comments.insert({
        cid: replyCid,
        preview_id: ctx?.previewId ?? '',
        session_id: ctx?.sessionId ?? '',
        thread_id: parent.thread_id,
        parent_id: input.cid,
        parts: commentSerialize.parts(input.parts),
        author_kind: input.author_kind ?? 'ai',
        author_model: input.author_model ?? null,
        status: 'open',
        kind: 'floating',
        anchor: null,
        anchor_file: null,
        anchor_component: null,
        anchor_hash: null,
        last_resolved_commit: null,
        last_resolved_file_hash: null,
        created_at: now,
        updated_at: now,
        resolved_at: null,
        resolved_by: null,
      })
      return {cid: replyCid}
    },
  })

  const read = defineTool({
    name: 'comment.read',
    label: 'Read comment',
    description: 'Read a comment and its full thread of replies.',
    parameters: z.object({cid: z.string()}),
    promptSnippet: 'Use comment.read to see a comment and everything in its thread.',
    execute: async (input) => {
      const root = await loadRecord(comments, input.cid)
      const thread = await comments.query({thread_id: root.thread_id, limit: LIMITS.threadReplies})
      const replies = thread
        .filter((row) => row.parent_id !== null)
        .map(toComment)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      return {comment: toComment(root), replies}
    },
  })

  const list = defineTool({
    name: 'comment.list',
    label: 'List comments',
    description: 'List top-level comments, scoped to the session or all, optionally by file or status.',
    parameters: z.object({
      scope: z.enum(['session', 'all']),
      file: z.string().optional(),
      status: z.enum(['open', 'resolved', 'drifted', 'orphaned']).optional(),
    }),
    promptSnippet:
      'Use comment.list to find existing comments before adding more; scope "session" for the current one.',
    execute: async (input, ctx) => {
      const sessionFilter = input.scope === 'session' ? {session_id: ctx?.sessionId ?? ''} : {}
      const fileFilter = input.file ? {anchor_file: input.file} : {}
      const statusFilter = input.status ? {status: input.status} : {}
      const rows = await comments.query({
        ...sessionFilter,
        ...fileFilter,
        ...statusFilter,
        limit: Math.min(LIMITS.sessionComments, 1000),
      })
      const top = rows.filter((row) => row.parent_id === null).map(toComment)
      return {comments: top}
    },
  })

  const resolve = defineTool({
    name: 'comment.resolve',
    label: 'Resolve comment',
    description: 'Mark a comment resolved.',
    parameters: z.object({cid: z.string()}),
    promptSnippet: 'Use comment.resolve once a comment has been addressed.',
    execute: async (input) => {
      const now = Date.now()
      await comments.update(input.cid, {status: 'resolved', resolved_at: now, updated_at: now})
      return {cid: input.cid, status: 'resolved'}
    },
  })

  const move = defineTool({
    name: 'comment.move',
    label: 'Move comment pin',
    description: 'Move a comment pin to new canvas coordinates.',
    parameters: z.object({cid: z.string(), x: z.number(), y: z.number()}),
    promptSnippet: 'Use comment.move to reposition a comment pin on the canvas.',
    execute: async (input, ctx) => {
      patchPin(sync, ctx, input.cid, {x: input.x, y: input.y})
      return {cid: input.cid, x: input.x, y: input.y}
    },
  })

  const setState = defineTool({
    name: 'pin.setState',
    label: 'Set pin state',
    description: 'Set a pin to locked (tracks its element) or offset (floats at a custom position).',
    parameters: z.object({cid: z.string(), pinState: z.enum(['locked', 'offset'])}),
    promptSnippet: 'Use pin.setState to lock a pin to its element or let it float at an offset.',
    execute: async (input, ctx) => {
      patchPin(sync, ctx, input.cid, {pinState: input.pinState})
      return {cid: input.cid, pinState: input.pinState}
    },
  })

  return [create, remove, reply, read, list, resolve, move, setState]
}
