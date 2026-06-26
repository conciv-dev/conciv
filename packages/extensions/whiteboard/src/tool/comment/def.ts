import {z} from 'zod'

const authorKind = z.enum(['human', 'ai'])
const statusEnum = z.enum(['open', 'resolved', 'drifted', 'orphaned'])

export const CommentCreateInput = z.object({
  cid: z.string(),
  kind: z.enum(['source-linked', 'floating']),
  parts: z.array(z.unknown()),
  anchor: z.unknown().optional(),
  x: z.number(),
  y: z.number(),
  elementId: z.string().nullable().optional(),
  authorKind,
  authorModel: z.string().nullable().optional(),
})
export const CommentReplyInput = z.object({
  cid: z.string(),
  parts: z.array(z.unknown()),
  authorKind: authorKind.optional(),
  authorModel: z.string().nullable().optional(),
})
export const CommentReadInput = z.object({cid: z.string()})
export const CommentListInput = z.object({
  scope: z.enum(['session', 'all']),
  file: z.string().optional(),
  status: statusEnum.optional(),
})
export const CommentResolveInput = z.object({cid: z.string()})
export const CommentDeleteInput = z.object({cid: z.string()})
export const CommentMoveInput = z.object({cid: z.string(), x: z.number(), y: z.number()})
export const PinSetStateInput = z.object({cid: z.string(), pinState: z.enum(['locked', 'offset'])})

export const commentCreateDef = {
  name: 'comment.create',
  description: 'Pin a comment to the canvas, optionally anchored to a source element.',
  inputSchema: CommentCreateInput,
  streamTitle: 'Leaving a comment',
  promptSnippet: 'Use comment.create to leave a pinned note on the canvas for the user to see.',
}

export const commentReplyDef = {
  name: 'comment.reply',
  description: 'Add a threaded reply to an existing comment.',
  inputSchema: CommentReplyInput,
  promptSnippet: 'Use comment.reply to answer a comment; the reply joins the same thread.',
}

export const commentReadDef = {
  name: 'comment.read',
  description: 'Read a comment and its full thread of replies.',
  inputSchema: CommentReadInput,
  promptSnippet: 'Use comment.read to see a comment and everything in its thread.',
}

export const commentListDef = {
  name: 'comment.list',
  description: 'List top-level comments, scoped to the session or all, optionally by file or status.',
  inputSchema: CommentListInput,
  promptSnippet: 'Use comment.list to find existing comments before adding more; scope "session" for the current one.',
}

export const commentResolveDef = {
  name: 'comment.resolve',
  description: 'Mark a comment resolved.',
  inputSchema: CommentResolveInput,
  approval: 'ask',
  promptSnippet: 'Use comment.resolve once a comment has been addressed.',
} as const

export const commentDeleteDef = {
  name: 'comment.delete',
  description: 'Remove a comment and its canvas pin.',
  inputSchema: CommentDeleteInput,
  approval: 'ask',
  promptSnippet: 'Use comment.delete to remove a comment the user no longer wants.',
} as const

export const commentMoveDef = {
  name: 'comment.move',
  description: 'Move a comment pin to new canvas coordinates.',
  inputSchema: CommentMoveInput,
  promptSnippet: 'Use comment.move to reposition a comment pin on the canvas.',
}

export const pinSetStateDef = {
  name: 'pin.setState',
  description: 'Set a pin to locked (tracks its element) or offset (floats at a custom position).',
  inputSchema: PinSetStateInput,
  promptSnippet: 'Use pin.setState to lock a pin to its element or let it float at an offset.',
}
