import type {JsonValue} from 'jazz-tools'
import {defineTool} from '@mandarax/extension'
import {app} from '../../shared/schema.js'
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
  const [row] = await ctx.db.all(app.comments.where({sessionId, cid}), {tier: 'global'})
  if (!row) throw new Error(`comment ${cid} not found`)
  return row
}

const pinByCid = async (ctx: WhiteboardToolContext, room: string, cid: string) => {
  const [row] = await ctx.db.all(app.pins.where({room, cid}), {tier: 'global'})
  if (!row) throw new Error(`no pin for comment ${cid}`)
  return row
}

export const commentCreateTool = defineTool<typeof CommentCreateInput, WhiteboardToolContext>(commentCreateDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const now = new Date()
    const enriched = await enrichAnchor(ctx.cwd, input.anchor ?? null)
    await ctx.db
      .transaction((tx) => {
        tx.insert(app.comments, {
          sessionId,
          cid: input.cid,
          threadId: input.cid,
          parts: input.parts as JsonValue,
          authorKind: input.authorKind,
          authorModel: input.authorModel ?? undefined,
          status: 'open',
          kind: input.kind,
          anchor: (enriched.anchor ?? undefined) as JsonValue,
          anchorFile: enriched.file ?? undefined,
          anchorComponent: enriched.component ?? undefined,
          anchorHash: enriched.hash ?? undefined,
          createdAt: now,
          updatedAt: now,
        })
        tx.insert(app.pins, {
          room: ctx.room(request),
          cid: input.cid,
          x: input.x,
          y: input.y,
          elementId: input.elementId ?? undefined,
          pinState: 'locked',
        })
      })
      .wait({tier: 'edge'})
    return {cid: input.cid}
  },
)

export const commentReplyTool = defineTool<typeof CommentReplyInput, WhiteboardToolContext>(commentReplyDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const parent = await commentByCid(ctx, sessionId, input.cid)
    const now = new Date()
    const replyCid = crypto.randomUUID()
    await ctx.db
      .insert(app.comments, {
        sessionId,
        cid: replyCid,
        threadId: parent.threadId,
        parentId: input.cid,
        parts: input.parts as JsonValue,
        authorKind: input.authorKind ?? 'ai',
        authorModel: input.authorModel ?? undefined,
        status: 'open',
        kind: 'floating',
        createdAt: now,
        updatedAt: now,
      })
      .wait({tier: 'edge'})
    return {cid: replyCid}
  },
)

export const commentReadTool = defineTool<typeof CommentReadInput, WhiteboardToolContext>(commentReadDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const root = await commentByCid(ctx, sessionId, input.cid)
    const thread = await ctx.db.all(app.comments.where({sessionId, threadId: root.threadId}), {tier: 'global'})
    const replies = thread
      .filter((row) => row.parentId)
      .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    return {comment: root, replies}
  },
)

export const commentListTool = defineTool<typeof CommentListInput, WhiteboardToolContext>(commentListDef).server(
  async (input, ctx, request) => {
    const sessionId = ctx.sessionId(request)
    const rows = await ctx.db.all(app.comments.where({sessionId}), {tier: 'global'})
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
  const now = new Date()
  const comment = await commentByCid(ctx, ctx.sessionId(request), input.cid)
  await ctx.db
    .update(app.comments, comment.id, {status: 'resolved', resolvedAt: now, updatedAt: now})
    .wait({tier: 'edge'})
  return {cid: input.cid, status: 'resolved'}
})

export const commentDeleteTool = defineTool<typeof CommentDeleteInput, WhiteboardToolContext>(commentDeleteDef).server(
  async (input, ctx, request) => {
    const comment = await commentByCid(ctx, ctx.sessionId(request), input.cid)
    await ctx.db.delete(app.comments, comment.id).wait({tier: 'edge'})
    const pins = await ctx.db.all(app.pins.where({room: ctx.room(request), cid: input.cid}), {tier: 'global'})
    await Promise.all(pins.map((pin) => ctx.db.delete(app.pins, pin.id).wait({tier: 'edge'})))
    return {cid: input.cid, deleted: true}
  },
)

export const commentMoveTool = defineTool<typeof CommentMoveInput, WhiteboardToolContext>(commentMoveDef).server(
  async (input, ctx, request) => {
    const pin = await pinByCid(ctx, ctx.room(request), input.cid)
    await ctx.db.update(app.pins, pin.id, {x: input.x, y: input.y}).wait({tier: 'edge'})
    return {cid: input.cid, x: input.x, y: input.y}
  },
)

export const pinSetStateTool = defineTool<typeof PinSetStateInput, WhiteboardToolContext>(pinSetStateDef).server(
  async (input, ctx, request) => {
    const pin = await pinByCid(ctx, ctx.room(request), input.cid)
    await ctx.db.update(app.pins, pin.id, {pinState: input.pinState}).wait({tier: 'edge'})
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
