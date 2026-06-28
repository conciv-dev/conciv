import {z} from 'zod'
import {defineTool} from '@mandarax/extension'
import {app} from '../../shared/schema.js'
import {loadResolver} from '../../anchor/load-resolver.js'
import type {WhiteboardToolContext} from '../../server/context.js'
import {anchorResolveDef, type AnchorResolveInput} from './def.js'

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

export const anchorResolveTool = defineTool<typeof AnchorResolveInput, WhiteboardToolContext>(anchorResolveDef).server(
  async (input, ctx) => {
    const [row] = await ctx.db.all(app.comments.where({cid: input.cid}), {tier: 'global'})
    if (!row) throw new Error(`comment ${input.cid} not found`)
    const parsed = StoredAnchor.safeParse(row.anchor)
    if (!parsed.success) return {status: 'orphaned'}
    const resolver = await loadResolver(ctx.cwd)
    const result = await resolver.resolve(parsed.data)
    return {status: result.status, anchor: result.anchor, candidates: result.candidates, diff: result.diff}
  },
)

export const anchorTools = [anchorResolveTool]
