import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

const authorKind = z.enum(['human', 'ai'])
const statusEnum = z.enum(['open', 'resolved', 'drifted', 'orphaned'])

const CommentRow = z
  .object({
    cid: z.string(),
    threadId: z.string(),
    parentId: z.string().nullable(),
    status: z.string(),
    parts: z.unknown(),
    authorKind: z.string(),
  })
  .loose()

const COMMENT_NOT_FOUND = {COMMENT_NOT_FOUND: {message: 'no comment with that cid in this session'}}

const PIN_NOT_FOUND = {PIN_NOT_FOUND: {message: 'no pin for that comment in this room'}}

export const commentCreateDef = toolDefinition({
  name: 'comment.create',
  description: 'Pin a comment to the canvas, optionally anchored to a source element.',
  inputSchema: z.object({
    cid: z.string(),
    kind: z.enum(['source-linked', 'floating']),
    parts: z.array(z.unknown()),
    anchor: z.unknown().optional(),
    x: z.number().describe('Pin position: scene X coordinate (canvas space, as returned by canvas.read).'),
    y: z.number().describe('Pin position: scene Y coordinate (canvas space, as returned by canvas.read).'),
    elementId: z.string().nullable().optional(),
    authorKind,
    authorModel: z.string().nullable().optional(),
  }),
  outputSchema: z.object({cid: z.string()}),
  meta: {
    summary: 'pin a comment to the canvas',
    category: 'whiteboard',
    mutating: true,
    keywords: ['comment', 'pin', 'create'],
    hint: 'x/y are scene coordinates from canvas.read',
  },
  streamTitle: 'Leaving a comment',
  promptSnippet:
    'Use comment.create to leave a pinned note on the canvas for the user to see. x/y are scene coordinates in canvas space (use the x/y of an element from canvas.read to pin near it).',
})

export const commentReplyDef = toolDefinition({
  name: 'comment.reply',
  description: 'Add a threaded reply to an existing comment.',
  inputSchema: z.object({
    cid: z.string(),
    parts: z.array(z.unknown()),
    authorKind: authorKind.optional(),
    authorModel: z.string().nullable().optional(),
  }),
  outputSchema: z.object({cid: z.string()}),
  errors: COMMENT_NOT_FOUND,
  meta: {
    summary: 'add a threaded reply to a comment',
    category: 'whiteboard',
    mutating: true,
    keywords: ['comment', 'reply', 'thread'],
  },
  promptSnippet: 'Use comment.reply to answer a comment; the reply joins the same thread.',
})

export const commentReadDef = toolDefinition({
  name: 'comment.read',
  description: 'Read a comment and its full thread of replies.',
  inputSchema: z.object({cid: z.string()}),
  outputSchema: z.object({comment: CommentRow, replies: z.array(CommentRow)}),
  errors: COMMENT_NOT_FOUND,
  meta: {
    summary: 'read a comment with its full thread',
    category: 'whiteboard',
    mutating: false,
    keywords: ['comment', 'read', 'thread'],
  },
  promptSnippet: 'Use comment.read to see a comment and everything in its thread.',
})

export const commentListDef = toolDefinition({
  name: 'comment.list',
  description: 'List top-level comments, scoped to the session or all, optionally by file or status.',
  inputSchema: z.object({
    scope: z.enum(['session', 'all']),
    file: z.string().optional(),
    status: statusEnum.optional(),
  }),
  outputSchema: z.object({comments: z.array(CommentRow)}),
  meta: {
    summary: 'list top-level comments by scope, file or status',
    category: 'whiteboard',
    mutating: false,
    keywords: ['comment', 'list'],
    hint: 'scope "session" limits the listing to the current session',
  },
  promptSnippet: 'Use comment.list to find existing comments before adding more; scope "session" for the current one.',
})

export const commentResolveDef = toolDefinition({
  name: 'comment.resolve',
  description: 'Mark a comment resolved.',
  inputSchema: z.object({cid: z.string()}),
  outputSchema: z.object({cid: z.string(), status: z.literal('resolved')}),
  errors: COMMENT_NOT_FOUND,
  approval: 'ask',
  meta: {
    summary: 'mark a comment resolved',
    category: 'whiteboard',
    mutating: true,
    keywords: ['comment', 'resolve'],
  },
  promptSnippet: 'Use comment.resolve once a comment has been addressed.',
})

export const commentDeleteDef = toolDefinition({
  name: 'comment.delete',
  description: 'Remove a comment; deleting a thread root removes the whole thread and its canvas pin.',
  inputSchema: z.object({cid: z.string()}),
  outputSchema: z.object({cid: z.string(), deleted: z.literal(true)}),
  errors: COMMENT_NOT_FOUND,
  approval: 'ask',
  meta: {
    summary: 'remove a comment or its whole thread',
    category: 'whiteboard',
    mutating: true,
    keywords: ['comment', 'delete'],
    hint: 'deleting a thread root removes the whole thread and its pin',
  },
  promptSnippet:
    'Use comment.delete to remove a comment the user no longer wants; deleting the first comment removes the whole thread.',
})

export const commentMoveDef = toolDefinition({
  name: 'comment.move',
  description: 'Move a comment pin to new canvas coordinates.',
  inputSchema: z.object({
    cid: z.string(),
    x: z.number().describe('New pin position: scene X coordinate (canvas space, as returned by canvas.read).'),
    y: z.number().describe('New pin position: scene Y coordinate (canvas space, as returned by canvas.read).'),
  }),
  outputSchema: z.object({cid: z.string(), x: z.number(), y: z.number()}),
  errors: PIN_NOT_FOUND,
  meta: {
    summary: 'move a comment pin to new coordinates',
    category: 'whiteboard',
    mutating: true,
    keywords: ['comment', 'pin', 'move'],
  },
  promptSnippet: 'Use comment.move to reposition a comment pin on the canvas; x/y are scene coordinates.',
})

export const pinSetStateDef = toolDefinition({
  name: 'pin.setState',
  description: 'Set a pin to locked (tracks its element) or offset (floats at a custom position).',
  inputSchema: z.object({cid: z.string(), pinState: z.enum(['locked', 'offset'])}),
  outputSchema: z.object({cid: z.string(), pinState: z.enum(['locked', 'offset'])}),
  errors: PIN_NOT_FOUND,
  meta: {
    summary: 'lock a pin to its element or let it float',
    category: 'whiteboard',
    mutating: true,
    keywords: ['pin', 'lock', 'offset'],
  },
  promptSnippet: 'Use pin.setState to lock a pin to its element or let it float at an offset.',
})
