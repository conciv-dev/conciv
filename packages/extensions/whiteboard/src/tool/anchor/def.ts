import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

export const anchorResolveDef = toolDefinition({
  name: 'anchor.resolve',
  description: 'Check whether a source-linked comment still points at its element (fresh/moved/drifted).',
  inputSchema: z.object({cid: z.string()}),
  outputSchema: z.object({status: z.string(), anchor: z.unknown(), candidates: z.unknown(), diff: z.unknown()}).loose(),
  errors: {COMMENT_NOT_FOUND: {message: 'no comment with that cid'}},
  meta: {
    summary: 'check whether a source-linked comment still points at its element',
    category: 'whiteboard',
    mutating: false,
    keywords: ['anchor', 'drift', 'resolve'],
  },
  promptSnippet: 'Use anchor.resolve to see if a comment has drifted from the code it was attached to.',
})
