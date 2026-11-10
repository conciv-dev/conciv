import {z} from 'zod'
import type {AnyToolBuilder, ExtensionDb} from '@conciv/extension'
import {defineTool} from '@conciv/extension/tool'
import type {
  Catalog,
  CatalogConfig,
  CatalogFlag,
  Component,
  Hint,
  Hinter,
  NodeRef,
  PropSketch,
  Ranked,
} from '../shared/catalog-defs.js'
import {DESIGN_TOOL_PREFIX, DESIGN_VERDICTS, type DesignRuntime, type Differ, type Got} from '../shared/defs.js'
import {DESIGN_TOOLS} from '../shared/design-tools.js'
import type {ToolReply} from '../shared/tool-reply.js'
import {renderComponents} from './catalog/render-list.js'
import {figmaRef} from './figma-ref.js'

const [getDef, checkDef, statusDef, , , componentsDef] = DESIGN_TOOLS

const NO_PAGE = 'no page registered for this link'

const HINT_RULE =
  'a node with hint is probably that project component: import it rather than drawing it, and ignore the hint when it does not fit'

const SOURCES =
  'Sources, each row with target and at: targets (the registered design: link, width, height, image, lead: the first frame of the set when the design has a frame per width), rounds (one per design_check: much, noticeably, slightly, pins, other, reflow, paint, rows_count, nodes, mapped, rendered, revoted, pixel_share, and against the round before: pixel_before, closed, opened, kept, gained, lost, changed_ratio, changed_regions, note, verdict, unsettled: why a round was measured but not judged), missing (per round the nodes no element renders, kind missing, not_rendered or dupe), candidates (tied votes: node, selector, score), widths (the widths a round measured: width, from, root_height, overflow_x), regions (where the screenshot changed since the round before: x, y, width, height and per overlapping element id, node, name, source, overlap; truncated when only the largest are listed), rows (what a round returned: node, id, source, selector, kind, name, magnitude, width, text, token, component, specifier, kit_token, design_token, confidence, margin; the kind of a paint row is fill, text color, font family, font weight, font size, line height, radius, border, opacity or image; a token-drift row is a paint row inside a component whose kit token and design variable disagree, with component, kit_token and design_token; a component row is a node the design names after a component but the page draws by hand, with component and specifier), nodes (one per Figma node of the design, its expected look: node, name, type, within, depth, x, y, w, h, fill_kind solid, gradient, image, image-stack (a background asset that is the fill stack flattened) or none, fill, fill_opacity, stroke, stroke_weight, radius, font_family, font_weight, font_size, line_height, text_align, text, opacity, image, asset, and the token each field is bound to: token_fill, token_stroke, token_radius, token_font, token_gap, token_padding), fom (the stored mapping per conciv id and Figma node: source, confidence, margin, round, revoted_round, reason, joined to the look of that node with every nodes field), votes (every candidate scored per node and round: candidate, path, dom, src, cssom, total, won), tool_calls (tool, input, reply: the whole reply the tool returned, reply_bytes, duration_ms, error), runs (model, prompt_head, started, ended, cost, verdict), labels (a verdict right or wrong on a node or id: run, round, node, id, verdict, by, note), notes (run, round, text) and node_components (which project component rendered each design node in a round: round, node, component_id, source, the source line that tied them).'

const EXAMPLES =
  'Examples: what the element with conciv id VgfUgw should look like: {from: "fom", where: "id == \\"VgfUgw\\"", select: ["node", "name", "fill", "radius", "font_family", "font_size", "asset"]}; every node bound to one token: {from: "nodes", where: "token_fill == \\"color/brand/primary\\"", select: ["node", "name", "fill"]}; the paint rows of round 4 by kind: {from: "rows", where: "round == 4 && magnitude == \\"paint\\"", select: ["kind", "node", "text"], order: [{field: "kind", dir: "asc"}]}.'

const QUERY_SUMMARY = `Reads one design source and returns its rows as JSON: from names the source, where is a CEL predicate over its fields (round == 3 && magnitude in ["much", "noticeably"], text.contains("Pro")), select the fields to return, order the fields to sort by (seq is the order rows were written), limit the most rows; ask only for what you need. ${EXAMPLES} ${SOURCES}`

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
      call: async () => withCatalog({reply: await ctx.differ.get({input, session: request.sessionId, page}), ctx}),
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
  componentsDef.server((input, ctx: DesignContext, request) =>
    recorded({
      ctx,
      tool: componentsDef.name,
      input,
      session: request.sessionId,
      call: () => listed({input, ctx, session: request.sessionId}),
    }),
  ),
  queryDef.server((input, ctx: DesignContext) => ctx.db.read(input)),
  writeDef.server((input, ctx: DesignContext) => ctx.db.write(input)),
] as const satisfies readonly AnyToolBuilder[]

type DesignContext = {
  design: DesignRuntime
  differ: Differ
  db: ExtensionDb<Record<never, never>>
  catalog: Catalog
  catalogConfig: CatalogConfig
  hinters: Hinter[]
}

type GetReply = Got | {variants: Got[]}

async function withCatalog(input: {reply: GetReply; ctx: DesignContext}): Promise<GetReply> {
  const {reply, ctx} = input
  const config = ctx.catalogConfig
  if (config.sources.length === 0 || (!config.section && !config.hint)) return reply
  const ranked = await ctx.catalog.list({})
  if (ranked.length === 0) return reply
  if ('variants' in reply)
    return {variants: await Promise.all(reply.variants.map((got) => withComponents({got, ranked, ctx})))}
  return withComponents({got: reply, ranked, ctx})
}

async function withComponents(input: {got: Got; ranked: Ranked[]; ctx: DesignContext}): Promise<Got> {
  const {got, ranked, ctx} = input
  const config = ctx.catalogConfig
  const hints = config.hint ? await hintsOf({got, ranked, ctx}) : new Map<string, Hint>()
  const section = config.section
    ? {components: renderComponents({ranked, limits: config, hints: [...hints.values()]})}
    : {}
  if (hints.size === 0) return {...got, ...section}
  return {
    ...got,
    ...section,
    rules: [...got.rules, HINT_RULE],
    nodes: got.nodes.map((node) => {
      const hint = hints.get(node.id)
      return hint === undefined ? node : {...node, hint}
    }),
  }
}

async function hintsOf(input: {got: Got; ranked: Ranked[]; ctx: DesignContext}): Promise<Map<string, Hint>> {
  const {got, ranked, ctx} = input
  const design = await ctx.design.store.design(got.target)
  const config = ctx.catalogConfig
  return new Map(ctx.hinters.flatMap((hinter) => [...hinter.hint({design, ranked, config})]))
}

type ComponentsInput = z.output<typeof componentsDef.inputSchema>

async function listed(asked: {input: ComponentsInput; ctx: DesignContext; session: string}) {
  const {input, ctx, session} = asked
  const marks = [
    {name: input.prefer, flag: 'prefer'},
    {name: input.doNotUse, flag: 'do-not-use'},
    {name: input.clear, flag: 'clear'},
  ] satisfies {name: string | undefined; flag: CatalogFlag}[]
  await Promise.all(marks.flatMap((mark) => (mark.name === undefined ? [] : [ctx.catalog.flag(mark.name, mark.flag)])))
  if (input.show !== undefined) {
    const component = await ctx.catalog.show(input.show)
    return {text: shownText(component), component, preview: component.preview}
  }
  const {store} = ctx.design
  const record = await targetBehind({link: input.link, session, store})
  const components = await ctx.catalog.list({live: record === null ? [] : await store.sources(record.id)})
  const text = renderComponents({ranked: components, limits: ctx.catalogConfig})
  return {text: input.link !== undefined && record === null ? `${NO_PAGE}\n\n${text}` : text, components}
}

async function targetBehind(input: {link: string | undefined; session: string; store: DesignRuntime['store']}) {
  const {link, session, store} = input
  if (link === undefined) return store.current(session)
  const ref = figmaRef(link)
  return (await store.list()).find((record) => record.ref === ref) ?? null
}

function shownText(component: Component & {nodes: NodeRef[]}): string {
  return [
    `${component.names.join(', ')} from '${component.specifier}'`,
    component.file,
    ...(component.sentence === null ? [] : [component.sentence]),
    ...(component.props === 'see file' ? ['props: see file'] : component.props.map(propLine)),
    ...(component.usage === null ? [] : [`usage: ${component.usage}`]),
    ...(component.nodes.length === 0 ? [] : [`renders ${component.nodes.length} design nodes`]),
  ].join('\n')
}

function propLine(prop: PropSketch): string {
  return `${prop.name}${prop.required ? '' : '?'}: ${prop.type}`
}

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
      capture: 'none',
      keywords: ['design', 'data', spec.verb],
    },
  })
}

async function recorded<Reply extends ToolReply>(input: {
  ctx: DesignContext
  tool: string
  input: unknown
  session: string
  call: () => Promise<Reply>
}): Promise<Reply> {
  const {ctx, tool, session} = input
  const started = Date.now()
  const write = (outcome: {
    reply: ToolReply | null
    replyBytes: number | null
    error: string | null
    round: number | null
  }) =>
    ctx.design.store.writeToolCall({session, tool, input: input.input, durationMs: Date.now() - started, ...outcome})
  try {
    const reply = await input.call()
    const round = RoundOf.safeParse(reply).data?.round ?? null
    await write({reply, replyBytes: Buffer.byteLength(JSON.stringify(reply)), error: null, round})
    return reply
  } catch (error) {
    await write({
      reply: null,
      replyBytes: null,
      error: error instanceof Error ? error.message : String(error),
      round: null,
    })
    throw error
  }
}
