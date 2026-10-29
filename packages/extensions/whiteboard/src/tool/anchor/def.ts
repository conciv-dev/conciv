import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

export const anchorResolveDef = toolDefinition({
  name: 'anchor_resolve',
  description: 'Check whether a source-linked comment still points at its element (fresh/moved/drifted).',
  inputSchema: z.object({cid: z.string()}),
  outputSchema: z.object({
    status: z.enum(['fresh', 'moved', 'drifted', 'orphaned', 'ambiguous']),
    anchor: z.unknown().optional(),
    candidates: z.array(z.unknown()).optional(),
    diff: z.object({before: z.string(), after: z.string()}).optional(),
  }),
  errors: {COMMENT_NOT_FOUND: {message: 'no comment with that cid'}},
  meta: {
    summary: 'check whether a source-linked comment still points at its element',
    category: 'whiteboard',
    mutating: false,
    keywords: ['anchor', 'drift', 'resolve'],
  },
  promptSnippet: 'Use anchor_resolve to see if a comment has drifted from the code it was attached to.',
})
