import {z} from 'zod'
import type {AnyToolBuilder} from '@conciv/extension'
import {defineTool} from '@conciv/extension/tool'
import {DESIGN_TOOL_PREFIX, DESIGN_TOOLS, type DesignRuntime, type Differ} from '../shared/defs.js'

const [getDef, watchDef, validateDef] = DESIGN_TOOLS

const QUERY_SUMMARY =
  'Runs one read-only SELECT (or WITH ... SELECT) over the design tables and returns the rows as JSON; ask only for the columns you need. Every row carries target_id, run_id and at. design_targets: the registered design per target (link, width, height, image path, the design and id tree as JSON). design_rounds: one row per design_watch round (counts, coverage and reflow as JSON, pixel_share, tree hash, live and diff image paths). design_rows: the rows a round returned (node, id, source, selector, kind, name, magnitude, width, text, confidence, margin). design_fom: the stored mapping, one row per conciv id and Figma node (instance, confidence, margin, round voted, revoted_round and reason when it was voted again). design_votes: every candidate the vote scored per node and round, with the dom, src and cssom layer scores, total and won. design_tool_calls: each design tool call (tool, input, reply_bytes, duration_ms, error). design_runs: the harness runs (model, prompt_head, started, ended, cost, verdict). Other tables are refused.'

const queryDef = defineTool({
  name: `${DESIGN_TOOL_PREFIX}query`,
  description: QUERY_SUMMARY,
  inputSchema: z.object({sql: z.string().min(1).describe('one SELECT or WITH ... SELECT over the design_ tables')}),
  outputSchema: z.array(z.record(z.string(), z.unknown())),
  meta: {
    summary: QUERY_SUMMARY,
    category: 'design',
    icon: 'read',
    label: {running: 'Querying the design tables', done: 'Queried the design tables'},
    hint: QUERY_SUMMARY,
    mutating: false,
    mirrors: false,
    capture: 'none',
    keywords: ['design', 'query', 'sql', 'rounds', 'votes'],
  },
})

export const SERVER_STEPS = [
  getDef.server((input, ctx: DesignContext, request, page) =>
    recorded({
      ctx,
      tool: getDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.get({input, session: request.sessionId, page}),
    }),
  ),
  watchDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: watchDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.watch({nodes: input.nodes, session: request.sessionId}),
    }),
  ),
  validateDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: validateDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.validate({session: request.sessionId}),
    }),
  ),
  queryDef.server((input, ctx: DesignContext) => Promise.resolve(ctx.query(input.sql))),
] as const satisfies readonly AnyToolBuilder[]

type DesignContext = {design: DesignRuntime; differ: Differ; query: (sql: string) => Record<string, unknown>[]}

async function recorded<Reply>(input: {
  ctx: DesignContext
  tool: string
  input: unknown
  session: string
  call: () => Promise<Reply>
}): Promise<Reply> {
  const {ctx, tool, session} = input
  const started = Date.now()
  const write = (outcome: {replyBytes: number | null; error: string | null}) =>
    ctx.design.store.writeToolCall({session, tool, input: input.input, durationMs: Date.now() - started, ...outcome})
  try {
    const reply = await input.call()
    await write({replyBytes: Buffer.byteLength(JSON.stringify(reply)), error: null})
    return reply
  } catch (error) {
    await write({replyBytes: null, error: error instanceof Error ? error.message : String(error)})
    throw error
  }
}
