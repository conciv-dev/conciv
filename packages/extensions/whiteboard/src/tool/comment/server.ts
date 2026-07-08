import {and, eq} from 'drizzle-orm'
import {defineTool} from '@conciv/extension'
import {json, type JsonValue} from '../../shared/rows.js'
import {comments, pins} from '../../server/db/schema.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {enrichAnchor} from './anchor-enrich.js'
import {
  commentCreateDef,
  commentDeleteDef,
  commentListDef,
  commentMoveDef,
  commentReadDef,
  commentReplyDef,
  commentResolveDef,
  pinSetStateDef,
  type CommentCreateInput,
  type CommentDeleteInput,
  type CommentListInput,
  type CommentMoveInput,
  type CommentReadInput,
  type CommentReplyInput,
  type CommentResolveInput,
  type PinSetStateInput,
} from './def.js'

const commentByCid = async (ctx: WhiteboardToolContext, sessionId: string, cid: string) => {
  const [row] = await ctx.store.db
    .select()
    .from(comments)
    .where(and(eq(comments.sessionId, sessionId), eq(comments.cid, cid)))
  if (!row) throw new Error(`comment ${cid} not found`)
  return row
}

const pinByCid = async (ctx: WhiteboardToolContext, room: string, cid: string) => {
  const [row] = await ctx.store.db
    .select()
    .from(pins)
    .where(and(eq(pins.room, room), eq(pins.cid, cid)))
  if (!row) throw new Error(`no pin for comment ${cid}`)
  return row
}

const AGENT_COLOR = '#19c3b2'
const AGENT_THROTTLE_MS = 50
const lastPresence = new Map<string, number>()

const markPresence = (
  ctx: WhiteboardToolContext,
  request: Parameters<WhiteboardToolContext['model']>[0],
  x: number,
  y: number,
): void => {
  const sessionId = ctx.sessionId(request)
  const model = ctx.model(request)
  const peerId = `agent:${model ?? 'ai'}`
  const key = `${sessionId}:${peerId}`
  const now = Date.now()
  if (now - (lastPresence.get(key) ?? 0) < AGENT_THROTTLE_MS) return
  lastPresence.set(key, now)
  ctx.store.cursor({
    room: sessionId,
    peerId,
    kind: 'agent',
    x,
    y,
    name: model ?? 'AI',
    color: AGENT_COLOR,
    lastSeen: now,
  })
}

export const commentCreateTool = defineTool<typeof CommentCreateInput, WhiteboardToolContext>(commentCreateDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const now = Date.now()
    const enriched = await enrichAnchor(ctx.cwd, input.anchor ?? null)
    await ctx.store.insertComment({
      id: crypto.randomUUID(),
      sessionId,
      cid: input.cid,
      threadId: input.cid,
      parentId: null,
      parts: input.parts as JsonValue,
      authorKind: input.authorKind,
      authorModel: input.authorModel ?? null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: input.kind,
      anchor: json.nullable().parse(enriched.anchor ?? null),
      anchorFile: enriched.file ?? null,
      anchorComponent: enriched.component ?? null,
      anchorHash: enriched.hash ?? null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    })
    await ctx.store.insertPin({
      id: crypto.randomUUID(),
      room: ctx.room(request),
      cid: input.cid,
      x: input.x,
      y: input.y,
      elementId: input.elementId ?? null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    })
    markPresence(ctx, request, input.x, input.y)
    return {cid: input.cid}
  },
)

export const commentReplyTool = defineTool<typeof CommentReplyInput, WhiteboardToolContext>(commentReplyDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const parent = await commentByCid(ctx, sessionId, input.cid)
    const now = Date.now()
    const replyCid = crypto.randomUUID()
    await ctx.store.insertComment({
      id: crypto.randomUUID(),
      sessionId,
      cid: replyCid,
      threadId: parent.threadId,
      parentId: input.cid,
      parts: input.parts as JsonValue,
      authorKind: input.authorKind ?? 'ai',
      authorModel: input.authorModel ?? null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: 'floating',
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    })
    const [pin] = await ctx.store.db
      .select()
      .from(pins)
      .where(and(eq(pins.room, ctx.room(request)), eq(pins.cid, parent.threadId)))
    if (pin) markPresence(ctx, request, pin.x, pin.y)
    return {cid: replyCid}
  },
)

export const commentReadTool = defineTool<typeof CommentReadInput, WhiteboardToolContext>(commentReadDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const root = await commentByCid(ctx, sessionId, input.cid)
    const thread = await ctx.store.db
      .select()
      .from(comments)
      .where(and(eq(comments.sessionId, sessionId), eq(comments.threadId, root.threadId)))
    const replies = thread.filter((row) => row.parentId).toSorted((left, right) => left.createdAt - right.createdAt)
    return {comment: root, replies}
  },
)

export const commentListTool = defineTool<typeof CommentListInput, WhiteboardToolContext>(commentListDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const rows = await ctx.store.db.select().from(comments).where(eq(comments.sessionId, sessionId))
    const top = rows
      .filter((row) => !row.parentId)
      .filter((row) => (input.file ? row.anchorFile === input.file : true))
      .filter((row) => (input.status ? row.status === input.status : true))
    return {comments: top}
  },
)

export const commentResolveTool = defineTool<typeof CommentResolveInput, WhiteboardToolContext>(
  commentResolveDef,
).server(async (input, ctx, request) => {
  const now = Date.now()
  const comment = await commentByCid(ctx, ctx.sessionId(request), input.cid)
  await ctx.store.updateComment(comment.id, {status: 'resolved', resolvedAt: now, updatedAt: now})
  return {cid: input.cid, status: 'resolved'}
})

export const commentDeleteTool = defineTool<typeof CommentDeleteInput, WhiteboardToolContext>(commentDeleteDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const comment = await commentByCid(ctx, sessionId, input.cid)
    const isRoot = comment.threadId === comment.cid
    const doomed = isRoot
      ? await ctx.store.db
          .select()
          .from(comments)
          .where(and(eq(comments.sessionId, sessionId), eq(comments.threadId, comment.threadId)))
      : [comment]
    for (const row of doomed) await ctx.store.deleteComment(row.id)
    if (isRoot) {
      const doomedPins = await ctx.store.db
        .select()
        .from(pins)
        .where(and(eq(pins.room, ctx.room(request)), eq(pins.cid, comment.cid)))
      for (const pin of doomedPins) await ctx.store.deletePin(pin.id)
    }
    return {cid: input.cid, deleted: true}
  },
)

export const commentMoveTool = defineTool<typeof CommentMoveInput, WhiteboardToolContext>(commentMoveDef).server(
  async (input, ctx, request) => {
    const pin = await pinByCid(ctx, ctx.room(request), input.cid)
    await ctx.store.updatePin(pin.id, {x: input.x, y: input.y})
    markPresence(ctx, request, input.x, input.y)
    return {cid: input.cid, x: input.x, y: input.y}
  },
)

export const pinSetStateTool = defineTool<typeof PinSetStateInput, WhiteboardToolContext>(pinSetStateDef).server(
  async (input, ctx, request) => {
    const pin = await pinByCid(ctx, ctx.room(request), input.cid)
    await ctx.store.updatePin(pin.id, {pinState: input.pinState})
    return {cid: input.cid, pinState: input.pinState}
  },
)

export const commentTools = [
  commentCreateTool,
  commentReplyTool,
  commentReadTool,
  commentListTool,
  commentResolveTool,
  commentDeleteTool,
  commentMoveTool,
  pinSetStateTool,
]
