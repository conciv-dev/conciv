import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'
import type {CanvasRelay, CanvasElement} from '../../canvas/relay.js'
import type {CommentStore} from '../../comments/comment-store.js'

// The canvas-comments built-in, authored against the real extension contract (dogfooding it) but
// registered at engine boot rather than file-discovered. Tools close over the canvas context (relay +
// comment store + active session). comment.create/delete are single executes that write BOTH the
// sqlite row and the Yjs pin, joined by a client-or-server-generated UUID (no temp->real swap).
export type CanvasContext = {
  relay: CanvasRelay
  comments: CommentStore
  sessionId: () => string
  previewId: () => string
  genId?: () => string
}

const ElementSchema = z.object({id: z.string(), version: z.number()}).passthrough()
const PartsSchema = z.array(z.object({type: z.string()}).passthrough())
const PinSchema = z.object({
  x: z.number(),
  y: z.number(),
  elementId: z.string().optional(),
  pinState: z.enum(['locked', 'offset']).default('locked'),
})

export function createCanvasCommentsExtension(ctx: CanvasContext) {
  const newId = ctx.genId ?? (() => randomUUID())

  const canvasRead = defineTool({
    name: 'canvas.read',
    description: 'Read every element currently on the canvas (id-keyed).',
    inputSchema: z.object({}),
    promptSnippet: 'Use canvas.read to see what is drawn before adding to it.',
  }).server(async () => ({elements: await ctx.relay.read(ctx.sessionId())}))

  const canvasDraw = defineTool({
    name: 'canvas.draw',
    description: 'Add or update elements on the canvas by id (granular, never a full-scene overwrite).',
    inputSchema: z.object({elements: z.array(ElementSchema)}),
    promptSnippet: 'Use canvas.draw with explicit element ids; re-drawing an id updates it in place.',
  }).server(async (input) => {
    await ctx.relay.draw(ctx.sessionId(), input.elements as CanvasElement[])
    return {ok: true, count: input.elements.length}
  })

  // One execute writes the comment row AND its Yjs pin, joined by the same id.
  const commentCreate = defineTool({
    name: 'comment.create',
    description: 'Create a comment, optionally pinned to a canvas point/element and anchored to source.',
    inputSchema: z.object({
      id: z.string().optional(),
      parts: PartsSchema,
      kind: z.enum(['source-linked', 'floating']).default('floating'),
      authorKind: z.enum(['human', 'ai']).default('human'),
      authorModel: z.string().optional(),
      anchor: z.unknown().optional(),
      anchorFile: z.string().optional(),
      anchorComponent: z.string().optional(),
      anchorHash: z.string().optional(),
      pin: PinSchema.optional(),
    }),
    promptSnippet: 'Use comment.create to leave a durable, place-anchored note the user will see later.',
  }).server(async (input) => {
    const id = input.id ?? newId()
    const comment = ctx.comments.create({
      id,
      sessionId: ctx.sessionId(),
      previewId: ctx.previewId(),
      threadId: id,
      parts: input.parts,
      authorKind: input.authorKind,
      authorModel: input.authorModel ?? null,
      kind: input.kind,
      anchor: input.anchor,
      anchorFile: input.anchorFile ?? null,
      anchorComponent: input.anchorComponent ?? null,
      anchorHash: input.anchorHash ?? null,
    })
    if (input.pin) await ctx.relay.setPin(ctx.sessionId(), {commentId: id, ...input.pin})
    return comment
  })

  const commentReply = defineTool({
    name: 'comment.reply',
    description: 'Reply to an existing comment thread.',
    inputSchema: z.object({
      parentId: z.string(),
      parts: PartsSchema,
      authorKind: z.enum(['human', 'ai']).default('human'),
      authorModel: z.string().optional(),
    }),
  }).server(async (input) => {
    const parent = ctx.comments.get(input.parentId)
    if (!parent) throw new Error(`unknown comment: ${input.parentId}`)
    return ctx.comments.create({
      id: newId(),
      sessionId: parent.sessionId,
      previewId: parent.previewId,
      threadId: parent.threadId,
      parentId: parent.id,
      parts: input.parts,
      authorKind: input.authorKind,
      authorModel: input.authorModel ?? null,
      kind: 'floating',
    })
  })

  const commentList = defineTool({
    name: 'comment.list',
    description: 'List comments, optionally filtered by file or status (defaults to the current session).',
    inputSchema: z.object({
      allSessions: z.boolean().default(false),
      file: z.string().optional(),
      status: z.enum(['open', 'resolved', 'drifted', 'orphaned']).optional(),
    }),
    promptSnippet: 'Call comment.list({file}) before editing a file to see the user notes pinned there.',
  }).server(async (input) => ({
    comments: ctx.comments.list({
      sessionId: input.allSessions ? undefined : ctx.sessionId(),
      file: input.file,
      status: input.status,
    }),
  }))

  const commentRead = defineTool({
    name: 'comment.read',
    description: 'Read a single comment (and its stored anchor) by id.',
    inputSchema: z.object({id: z.string()}),
  }).server(async (input) => ctx.comments.get(input.id))

  const commentResolve = defineTool({
    name: 'comment.resolve',
    description: 'Mark a comment resolved (greyed as completed).',
    inputSchema: z.object({id: z.string(), by: z.string().optional()}),
  }).server(async (input) => ctx.comments.setStatus(input.id, 'resolved', input.by))

  const commentDelete = defineTool({
    name: 'comment.delete',
    description: 'Delete a comment and its pin.',
    inputSchema: z.object({id: z.string()}),
  }).server(async (input) => {
    ctx.comments.delete(input.id)
    await ctx.relay.deletePin(ctx.sessionId(), input.id)
    return {ok: true}
  })

  return defineExtension({
    id: 'canvas-comments',
    tools: [
      canvasRead,
      canvasDraw,
      commentCreate,
      commentReply,
      commentList,
      commentRead,
      commentResolve,
      commentDelete,
    ],
  })
}
