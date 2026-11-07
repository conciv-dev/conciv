import {z} from 'zod'
import type {AnyToolBuilder, ExtensionDb} from '@conciv/extension'
import {defineTool} from '@conciv/extension/tool'
import {DESIGN_TOOL_PREFIX, DESIGN_TOOLS, DESIGN_VERDICTS, type DesignRuntime, type Differ} from '../shared/defs.js'

const [getDef, checkDef, statusDef] = DESIGN_TOOLS

const SOURCES =
  'Sources, each row with target and at: targets (the registered design: link, width, height, image), rounds (one per design_check: much, noticeably, slightly, pins, other, reflow, rows_count, nodes, mapped, rendered, revoted, pixel_share, and against the round before: pixel_before, closed, opened, kept, gained, lost, changed_ratio, changed_regions, note), missing (per round the nodes no element renders, kind missing, not_rendered or dupe), candidates (tied votes: node, selector, score), widths (the widths a round measured: width, from, root_height, overflow_x), regions (where the screenshot changed since the round before: x, y, width, height and per overlapping element id, node, name, source, overlap; truncated on the one box around too many), rows (what a round returned: node, id, source, selector, kind, name, magnitude, width, text, confidence, margin), fom (the stored mapping per id and Figma node: source, confidence, margin, round, revoted_round, reason), votes (every candidate scored per node and round: candidate, path, dom, src, cssom, total, won), tool_calls (tool, input, reply_bytes, duration_ms, error), runs (model, prompt_head, started, ended, cost, verdict), labels (a verdict right or wrong on a node or id: run, round, node, id, verdict, by, note) and notes (run, round, text).'

const QUERY_SUMMARY = `Reads one design source and returns its rows as JSON: from names the source, where is a CEL predicate over its fields (round == 3 && magnitude in ["much", "noticeably"], text.contains("Pro")), select the fields to return, order the fields to sort by (seq is the order rows were written), limit the most rows; ask only for what you need. ${SOURCES}`

const WRITE_SUMMARY = `Writes one row into labels or notes: into names the source, values maps its fields to values; at is filled in. Every other source is written by the design tools only. ${SOURCES}`

const RoundOf = z.object({round: z.number()})

const RowsSchema = z.array(z.record(z.string(), z.unknown()))

const queryDef = designDataTool({
  verb: 'query',
  summary: QUERY_SUMMARY,
  running: 'Reading the design data',
  done: 'Read the design data',
  input: z.object({
    from: z.string().min(1).describe('the source to read'),
    where: z.string().min(1).optional().describe('a CEL predicate over the source fields'),
    select: z.array(z.string().min(1)).optional().describe('the fields to return, all when absent'),
    order: z
      .array(z.object({field: z.string().min(1), dir: z.enum(['asc', 'desc'])}))
      .optional()
      .describe('the fields to sort by, in turn'),
    limit: z.number().int().positive().optional().describe('the most rows to return'),
  }),
})

const LabelValues = z.strictObject({
  target: z.string().min(1),
  run: z.number().int().optional(),
  round: z.number().int().optional(),
  node: z.string().min(1),
  id: z.string().min(1).optional(),
  verdict: z.enum(DESIGN_VERDICTS),
  by: z.string().min(1),
  note: z.string().optional(),
})

const NoteValues = z.strictObject({
  target: z.string().min(1),
  run: z.number().int().optional(),
  round: z.number().int().optional(),
  text: z.string().min(1),
})

const writeDef = designDataTool({
  verb: 'write',
  summary: WRITE_SUMMARY,
  running: 'Writing the design data',
  done: 'Wrote the design data',
  input: z.object({
    into: z.enum(['labels', 'notes']).describe('the writable source'),
    values: z.union([LabelValues, NoteValues]).describe('the row: a label into labels, a note into notes'),
  }),
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
  checkDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: checkDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.check({nodes: input.nodes, session: request.sessionId}),
    }),
  ),
  statusDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: statusDef.name,
      input,
      session: request.sessionId,
      call: () => ctx.differ.status({session: request.sessionId}),
    }),
  ),
  queryDef.server((input, ctx: DesignContext) => ctx.db.read(input)),
  writeDef.server((input, ctx: DesignContext) => ctx.db.write(input)),
] as const satisfies readonly AnyToolBuilder[]

type DesignContext = {design: DesignRuntime; differ: Differ; db: ExtensionDb<Record<never, never>>}

function designDataTool<Shape extends z.ZodRawShape>(spec: {
  verb: string
  summary: string
  running: string
  done: string
  input: z.ZodObject<Shape>
}) {
  return defineTool({
    name: `${DESIGN_TOOL_PREFIX}${spec.verb}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: RowsSchema,
    meta: {
      summary: spec.summary,
      category: 'design',
      icon: 'read',
      label: {running: spec.running, done: spec.done},
      hint: spec.summary,
      mutating: spec.verb === 'write',
      mirrors: false,
      capture: 'none',
      keywords: ['design', 'data', spec.verb],
    },
  })
}

async function recorded<Reply>(input: {
  ctx: DesignContext
  tool: string
  input: unknown
  session: string
  call: () => Promise<Reply>
}): Promise<Reply> {
  const {ctx, tool, session} = input
  const started = Date.now()
  const write = (outcome: {replyBytes: number | null; error: string | null; round: number | null}) =>
    ctx.design.store.writeToolCall({session, tool, input: input.input, durationMs: Date.now() - started, ...outcome})
  try {
    const reply = await input.call()
    const round = RoundOf.safeParse(reply).data?.round ?? null
    await write({replyBytes: Buffer.byteLength(JSON.stringify(reply)), error: null, round})
    return reply
  } catch (error) {
    await write({replyBytes: null, error: error instanceof Error ? error.message : String(error), round: null})
    throw error
  }
}
