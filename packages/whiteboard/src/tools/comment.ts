import {z} from 'zod'
import {defineTool, type ToolDefinition, type ToolExecuteCtx} from '@mandarax/extensions'
import type {SyncEngine} from '@mandarax/protocol/sync-types'
import type {ServerCollection} from '@mandarax/protocol/db-types'
import {ORIGIN, PINS_KEY, roomId, type PinGeometry} from '../room.js'
import {commentSerialize, type CommentRecord} from '../schema.js'

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

export function createCommentTools(comments: ServerCollection<CommentRecord>, sync: SyncEngine): ToolDefinition[] {
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
      const anchor = input.anchor ?? null
      const source = sourceOf(anchor)
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
        anchor: commentSerialize.anchor(anchor),
        anchor_file: source.file,
        anchor_component: source.component,
        anchor_hash: source.hash,
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

  return [create, remove]
}
