import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'
import {canvasEffect} from './canvas/canvas-effect.js'
import {createCanvasTools} from './tools/canvas.js'
import {setCommentsCollection} from './comments-store.js'
import {
  COMMENT_COLUMNS,
  CommentRecordSchema,
  commentParse,
  commentSerialize,
  type Comment,
  type CommentRecord,
} from './schema.js'

export {
  COMMENT_COLUMNS,
  CommentRecordSchema,
  CommentSchema,
  commentParse,
  commentSerialize,
  LIMITS,
  type Comment,
  type CommentRecord,
} from './schema.js'

const ping = defineTool({
  name: 'whiteboard.ping',
  label: 'Whiteboard ping',
  description: 'Health check for the whiteboard extension.',
  parameters: z.object({}),
  execute: async () => 'pong',
})

export default defineExtension({id: 'whiteboard', tools: [ping], effects: [canvasEffect]})
  .server((mx) => {
    mx.db.collection<CommentRecord>('comments', {schema: CommentRecordSchema, columns: COMMENT_COLUMNS, fts: ['parts']})
    createCanvasTools(mx.sync).forEach((tool) => mx.registerTool(tool))
    mx.approval('canvas.delete', 'ask')
    mx.approval('canvas.clear', 'ask')
  })
  .client((mx) => {
    const comments = mx.db.collection<Comment, CommentRecord>('comments', {
      parse: commentParse,
      serialize: commentSerialize,
    })
    setCommentsCollection(comments)
  })
