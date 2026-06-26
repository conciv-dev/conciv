import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import type {ServerCollection} from '@mandarax/protocol/db-types'
import {commentParse, type CommentRecord} from '../schema.js'
import {loadResolver} from '../anchor/load-resolver.js'

// The stored anchor shape (a full SourceAnchor); a partial 3.6-era anchor that lacks the hash fails to
// parse and resolves as orphaned rather than being silently treated as fresh.
const StoredAnchor = z.object({
  source: z.object({
    file: z.string(),
    line: z.number(),
    column: z.number(),
    component: z.string().nullable(),
    hash: z.string(),
    salt: z.string(),
    snippet: z.string(),
    commit: z.string().nullable(),
  }),
  instance: z
    .object({
      selector: z.string().optional(),
      rect: z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()}).optional(),
      instanceKey: z.string().optional(),
    })
    .optional(),
})

export function createAnchorTools(comments: ServerCollection<CommentRecord>, cwd: string): ToolDefinition[] {
  const resolve = defineTool({
    name: 'anchor.resolve',
    label: 'Resolve anchor',
    description: 'Check whether a source-linked comment still points at its element (fresh/moved/drifted).',
    parameters: z.object({cid: z.string()}),
    promptSnippet: 'Use anchor.resolve to see if a comment has drifted from the code it was attached to.',
    execute: async (input) => {
      const [row] = await comments.query({cid: input.cid})
      if (!row) throw new Error(`comment ${input.cid} not found`)
      const parsed = StoredAnchor.safeParse(commentParse.anchor(row.anchor))
      if (!parsed.success) return {status: 'orphaned'}
      const resolver = await loadResolver(cwd)
      const result = await resolver.resolve(parsed.data)
      return {status: result.status, anchor: result.anchor, candidates: result.candidates, diff: result.diff}
    },
  })
  return [resolve]
}
