import {z} from 'zod'
import type {Storage} from 'unstorage'
import type {ToolBuilder, ToolErrors} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {defineTool} from '@conciv/extension/tool'
import type {Store} from './store.js'

const ROLES = ['placeholder', 'data', 'unknown'] as const
const PLACEHOLDER_KINDS = ['icon', 'logo', 'image', 'avatar'] as const
const DESIGN_EXTENSION_NAME = 'design'
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

export const DESIGN_TOOL_PREFIX = 'design_'

export const DESIGN_VERDICTS = ['right', 'wrong'] as const
const CHECK_VERDICTS = ['done', 'not yet', 'stalled', 'unsettled'] as const

const MeasureSourceSchema = z.enum(['dom', 'mirror', 'takumi'])
const CapturePathSchema = z.enum(['region', 'snapdom-live', 'snapdom-mirror'])
const MirrorLimitsSchema = z.object({canvases: z.number(), fonts: z.array(z.string()), inlineWidths: z.number()})
const BoxSchema = z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})
const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})
const DirectionSchema = z.enum(['row', 'column', 'grid', 'stack'])
const SizeSchema = z.enum(['fill', 'fit', 'fixed'])
const GapSchema = z.object({px: z.number(), uniform: z.boolean()})
const AlignSchema = z.enum(['start', 'center', 'end', 'stretch'])
const PaddingSchema = z.object({top: z.number(), right: z.number(), bottom: z.number(), left: z.number()})

const RowRunSchema = z
  .object({
    direction: z.literal('row'),
    children: z.array(z.string()),
    gap: GapSchema,
    align: AlignSchema,
    wrap: z.boolean(),
  })
  .describe('children of a column or stack that sit on one line, in reading order')

const ContainerLayoutSchema = z.object({
  direction: DirectionSchema,
  gap: GapSchema,
  align: AlignSchema.describe('on the cross axis'),
  wrap: z.boolean(),
  padding: PaddingSchema.describe('the inset from the box to the union of its children'),
  runs: z.array(RowRunSchema),
})

const NodeLayoutSchema = ContainerLayoutSchema.partial().extend({
  size: SizeSchema.describe('on the direction axis of the parent'),
  index: z.number().describe('1-based position among the parent children in reading order'),
})

const SizingSchema = z.enum(['fixed', 'set', 'auto'])

const LiveStylesSchema = z.object({
  background: z.string(),
  color: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  fontWeight: z.number(),
  fontFamily: z.string(),
  textAlign: z.string().describe('the computed text-align'),
  radius: z.number(),
  position: z.string(),
  display: z.string().default(''),
  flexDirection: z.string().default(''),
  overflowX: z.string().default('visible'),
  sizing: z.object({width: SizingSchema, height: SizingSchema}).describe('fixed: own px rule, set: any other size'),
  border: z.object({width: z.number(), style: z.string(), color: z.string(), side: z.enum(BORDER_SIDES)}),
  gradient: z.object({from: z.string(), to: z.string()}).nullable().default(null),
})

const GlyphSchema = z.object({text: z.string(), boxes: z.array(BoxSchema)})

const OpinionSchema = z.object({box: BoxSchema, confidence: z.number()})

const LiveComponentFieldsSchema = z.object({
  source: SourceLocSchema.nullable(),
  key: z.string().nullable().describe('the data-conciv-key the compiler wrote, null without one'),
  instance: z.string().nullable().default(null).describe('the call-site and React keys of the fiber chain'),
  repeat: z.string().nullable().default(null).describe('data-conciv-instance where siblings share the key'),
  owner: z.string().nullable().describe('the component owner path from the root, null when the framework is unknown'),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema.describe('clipped to the measured viewport'),
  bounds: BoxSchema.default({x: 0, y: 0, w: 0, h: 0}).describe('the page box, unclipped and unrounded, scrolled'),
  scrolls: z.boolean().default(false).describe('its content is wider than its box'),
  textBox: BoxSchema.nullable(),
  glyphs: z.array(GlyphSchema).describe('the text nodes the component paints, each with one box per line'),
  axis: z.enum(['row', 'column']).nullable(),
  columns: z.number().nullable().describe('track count of grid-template-columns, null when not a grid'),
  styles: LiveStylesSchema,
  role: z.string().nullable().describe('the role attribute'),
  hints: z.array(z.string()).describe('class names and the aria-label, tokens for pairing'),
  index: z.number().describe('position among the DOM siblings, 1-based'),
  path: z.string().describe('sibling positions from the root joined by /, with s entering a shadow root'),
  opinion: OpinionSchema.optional(),
  drawn: z.boolean().default(false).describe('an svg with shapes, an img with a data: src, or a canvas'),
  placeholder: z.enum(PLACEHOLDER_KINDS).nullable().default(null).describe('the kind of the Placeholder it roots'),
})

const LiveComponentWireSchema = LiveComponentFieldsSchema.extend({
  children: z.array(z.record(z.string(), z.unknown())).describe('nested components of the same shape'),
})

const LiveComponentSchema = LiveComponentFieldsSchema.extend({
  get children(): z.ZodArray<typeof LiveComponentSchema> {
    return z.array(LiveComponentSchema)
  },
})

export const LiveComponentsSchema = z.array(LiveComponentSchema)

const OcrLineSchema = z.object({box: BoxSchema, text: z.string(), confidence: z.number()})

const TypographySchema = z.object({
  size: z.number(),
  lineHeight: z.number(),
  weight: z.number(),
  confidence: z.number(),
  font: z.string(),
  family: z.string().nullable().default(null),
})

const BorderSchema = z.object({width: z.number(), color: z.string()})

const PaintSchema = z.object({
  background: z.string(),
  gradient: z.object({from: z.string(), to: z.string(), axis: z.enum(['vertical', 'horizontal'])}).optional(),
})

const ReflowTagSchema = z.object({
  kind: z.enum(['stack', 'wrap', 'scroll']),
  minChildWidth: z.number().optional(),
  breakpoint: z.number().optional().describe('the row width under which a child would go below minChildWidth'),
})

const FigmaFactsSchema = z.object({
  type: z.string(),
  name: z.string(),
  absolute: z.boolean(),
  mode: z.string().nullable().describe('the auto-layout mode, null without auto layout'),
  box: BoxSchema.describe('the exact frame-relative box, unrounded'),
  fields: z.record(z.string(), z.unknown()).describe('the remaining node fields as design_get returns them'),
})

const GateFactsSchema = z.object({
  kind: z.string(),
  leaf: z.boolean(),
  parent: z.string().nullable().describe('the node the gate measures the position against'),
  direction: z.enum(['row', 'column']).optional(),
})

const DesignNodeKindSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string(),
    lines: z.array(OcrLineSchema),
    confidence: z.number(),
    role: z.enum(ROLES).optional(),
    typography: TypographySchema.optional(),
  }),
  z.object({
    kind: z.literal('box'),
    paint: PaintSchema.optional(),
    border: BorderSchema.nullable(),
    radius: z.number(),
  }),
  z.object({kind: z.literal('image'), holds: z.number()}),
])

const DesignNodeBaseSchema = z.object({
  id: z.string().describe('from the source: the Figma node id, or the image hash plus an index'),
  box: BoxSchema.describe('design px'),
  hash: z.string().describe('sha256 of the node own fields plus its children hashes'),
  layout: NodeLayoutSchema.partial().optional(),
  figma: FigmaFactsSchema.optional(),
  gate: GateFactsSchema.optional(),
  implied: z.boolean().optional().describe('a group the layout implies and the file does not draw'),
  reflow: ReflowTagSchema.optional(),
})

const DesignNodeSchema = DesignNodeBaseSchema.extend({
  get children(): z.ZodArray<typeof DesignNodeSchema> {
    return z.array(DesignNodeSchema)
  },
}).and(DesignNodeKindSchema)

export const DesignSchema = z.object({
  id: z.string(),
  source: z.object({kind: z.enum(['image', 'figma']), ref: z.string()}),
  viewport: z.object({width: z.number(), height: z.number()}),
  scale: z.number(),
  root: DesignNodeSchema,
})

const MatchSchema = z.object({
  node: DesignNodeBaseSchema.and(DesignNodeKindSchema),
  live: LiveComponentFieldsSchema.nullable().describe('null when the node is unbuilt'),
  hash: z.string().describe('sha256 of the live fingerprint plus the children hashes'),
  confidence: z.number(),
  margin: z.number().optional().describe('the winning score minus the runner-up score'),
  candidates: z.array(z.object({path: z.string(), score: z.number()})).optional(),
  get children(): z.ZodArray<typeof MatchSchema> {
    return z.array(MatchSchema)
  },
})

export const TargetRecordSchema = z.object({
  id: z.string(),
  session: z.string().default(''),
  ref: z.string().describe('the source ref: fileKey/nodeId of a Figma frame, the image path otherwise'),
  route: z.string().optional(),
  width: z.number(),
  height: z.number(),
  scale: z.number(),
  createdAt: z.number(),
})

const Count = z.number()

const Id = z.string().nullable()

const FomSchema = z.object({nodeId: z.string(), instance: Id, confidence: Count, margin: Count, round: Count})

export const MappingSchema = z.record(z.string(), z.object({nodes: z.array(FomSchema)}))

const DOM_FIELDS = {instance: Id, at: BoxSchema.describe('the box less the parent site element position'), kids: Count}

const IdNodeSchema = z.object({
  id: z.string().describe('the conciv key the compiler stamped on the site'),
  dom: z.array(LiveComponentFieldsSchema.pick({path: true, text: true, drawn: true, box: true}).extend(DOM_FIELDS)),
  cssom: z.array(LiveStylesSchema.extend({path: z.string(), columns: Count.nullable()})),
  src: z.object({at: SourceLocSchema.nullable(), element: z.string(), classes: z.array(z.string()), parent: Id}),
  fom: z.array(FomSchema),
  get children(): z.ZodArray<typeof IdNodeSchema> {
    return z.array(IdNodeSchema)
  },
})

export const IdTreeSchema = z.object({root: IdNodeSchema, revoted: z.array(z.string()), gone: z.array(z.string())})

const MagnitudeSchema = z.enum(['much', 'noticeably', 'slightly', 'pin', 'other', 'reflow'])

const GateRowSchema = z.object({
  node: z.string(),
  id: Id.describe('the conciv id of the element that renders the node'),
  selector: z.string().nullable().describe('the selector of that element, from its id and list key'),
  source: z.string().nullable().describe('file:line:column of the element, from data-conciv-source'),
  confidence: z.number().nullable().describe('the winning score of the vote that mapped the node'),
  margin: z.number().nullable().describe('the winning score minus the runner-up score'),
  kind: z.string().describe('the kind of the design node'),
  name: z.string(),
  text: z.string(),
  magnitude: MagnitudeSchema,
  width: z.number().optional().describe('the page width a reflow row was measured at'),
})

const ReflowSchema = z.object({
  width: z.number(),
  rootHeight: z.number(),
  sticksOut: z.array(z.string()).describe('nodes whose element runs outside the root box'),
  overflowX: z.boolean().describe('the page scrolls sideways'),
  overlaps: z.array(z.tuple([z.string(), z.string()])).describe('sibling elements that cover each other'),
  tags: z.array(
    ReflowTagSchema.extend({
      node: z.string(),
      ok: z.boolean().nullable().describe('null when no element renders the node'),
      why: z.string(),
    }),
  ),
  rows: z.array(GateRowSchema).describe('tagged rows stacked above their breakpoint or not reflowed under it'),
})

const ReflowsSchema = z.object({
  widths: z.array(z.object({width: z.number(), from: z.array(z.string())})),
  results: z.array(ReflowSchema),
})

const CoverageSchema = z.object({
  nodes: z.number().describe('design nodes the gate measures'),
  mapped: z.number().describe('of them, nodes the mapping holds'),
  rendered: z.number().describe('of them, nodes an element renders now'),
  missing: z.array(z.string()).describe('nodes no element renders'),
  gone: z
    .array(z.object({id: z.string(), name: z.string()}))
    .optional()
    .describe('on an unsettled round, missing by name'),
  notRendered: z.array(z.string()).describe('stored nodes whose element is not on the page'),
  dupes: z.array(z.string()).describe('nodes whose id and list key match more than one element'),
  revoted: z.number().default(0).describe('stored pins voted again: their evidence changed or a rival outscored them'),
  candidates: z
    .array(z.object({node: z.string(), candidates: z.array(z.object({selector: z.string(), score: z.number()}))}))
    .default([])
    .describe('unmapped nodes whose vote tied, with the best candidates to pick from'),
})

const COUNTED = {much: Count, noticeably: Count, slightly: Count, pins: Count, other: Count, rows: Count}

const CountsSchema = z.object({...COUNTED, reflow: Count.default(0)})

const PixelsSchema = z.object({share: z.number().describe('share of mismatched pixels against the design image')})

export const RoundSchema = z.object({
  round: z.number(),
  rows: z.array(GateRowSchema),
  reflow: ReflowsSchema,
  coverage: CoverageSchema,
  counts: CountsSchema,
  pixels: PixelsSchema.nullable(),
  at: z.number(),
  tree: z.string().default('').describe('sha256 of the measured keys, boxes and styles and the page stylesheets'),
  verdict: z.enum(CHECK_VERDICTS).nullable().default(null),
  unsettled: z.string().nullable().default(null).describe('why the round was measured but not judged'),
})

const TaggedNodeSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    within: z.string().nullable(),
    depth: z.number(),
    box: BoxSchema,
    implied: z.boolean().optional(),
    reflow: ReflowTagSchema.optional(),
    selector: z.string().optional(),
  })
  .loose()

const GetInputSchema = z
  .object({
    figma: z.url().optional().describe('the Figma frame link, with its node-id'),
    document: z.unknown().optional().describe('the frame as the Figma REST nodes document, when the engine has no key'),
    image: z.string().meta({format: 'path'}).optional().describe('path of the design PNG, or the PNG as base64'),
  })
  .refine((input) => input.document === undefined || (input.figma !== undefined && input.image !== undefined), {
    message: 'document goes with figma and image',
  })

const GetResultSchema = z.object({
  target: z.string(),
  root: z.string(),
  count: z.number(),
  viewport: z.object({width: z.number(), height: z.number()}),
  rules: z.array(z.string()),
  nodes: z.array(TaggedNodeSchema),
})

const UnsettledSchema = z.object({unsettled: z.literal(true), rendered: z.number(), error: z.string().optional()})

const MeasuredSchema = RoundSchema.pick({round: true, rows: true, reflow: true, coverage: true, counts: true}).extend({
  unchanged: z.literal(true).optional().describe('the page measured as the last round did; this is that round'),
  ...UnsettledSchema.partial().shape,
})

const JUDGED = {verdict: z.enum(CHECK_VERDICTS), reasons: z.array(z.string())}

const CheckResultSchema = z.union([
  MeasuredSchema.extend(JUDGED),
  UnsettledSchema.extend({verdict: z.literal('unsettled'), reasons: z.array(z.string())}),
])

const StatusSchema = MeasuredSchema.pick({round: true, rows: true}).extend({
  ...JUDGED,
  counts: CountsSchema.nullable(),
  coverage: CoverageSchema.nullable(),
})

const MeasureResultSchema = z.object({
  image: z.string(),
  width: z.number(),
  height: z.number(),
  route: z.string(),
  components: z.array(LiveComponentWireSchema),
  capturePath: CapturePathSchema,
  source: MeasureSourceSchema,
  masks: z.array(BoxSchema),
  limits: MirrorLimitsSchema.optional(),
  opinion: z.boolean().describe('takumi laid the mirror out as a second opinion'),
  overflowX: z.boolean().default(false).describe('the measured page scrolls sideways'),
  queries: z.array(z.number()).default([]).describe('the widths the media and container queries of the page name'),
  sheets: z.string().default('').describe('sha256 of the page stylesheets'),
  framework: z.enum(['react', 'solid']).nullable().default(null).describe('react with a fiber, solid with vite ids'),
  longestTask: z.number().optional(),
  pageError: z.string().optional().describe('the first line of the dev server error overlay covering the page'),
})

const Width = z.number().int().positive()

const MeasureInputSchema = z.object({
  width: Width.optional().describe('the width to measure at; the mirror is read when it differs from the tab width'),
  height: Width.optional().describe('the height to capture'),
  timeout: z.number().int().positive().optional(),
})

const DESIGN_ERRORS = {
  'image-unreadable': {message: 'image is neither a PNG file nor PNG base64'},
  'no-target': {message: 'no design is registered; call design_get with the Figma link'},
  'figma-link': {
    message: 'the Figma link must point at a frame: https://www.figma.com/design/<fileKey>/<name>?node-id=<id>',
  },
  'figma-source': {
    message:
      'no way to read the Figma frame: set FIGMA_API_KEY for the engine, or fetch the frame with your Figma MCP and pass it as document together with its image',
  },
  'figma-request': {message: 'Figma did not answer the request'},
} satisfies ToolErrors

type DesignToolDef<Shape extends z.ZodRawShape, Out extends z.ZodType> = ToolBuilder<
  string,
  z.ZodObject<Shape>,
  Out,
  typeof DESIGN_ERRORS,
  undefined,
  unknown
>

function designTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  verb: string
  summary: string
  running: string
  done: string
  input: z.ZodObject<Shape>
  output: Out
  keywords: readonly string[]
  catalog?: boolean
}): DesignToolDef<Shape, Out> {
  return defineTool({
    name: `${DESIGN_TOOL_PREFIX}${spec.verb}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    errors: DESIGN_ERRORS,
    meta: {
      summary: spec.summary,
      category: DESIGN_EXTENSION_NAME,
      icon: 'read',
      label: {running: spec.running, done: spec.done},
      hint: spec.summary,
      mutating: false,
      mirrors: false,
      capture: 'none',
      keywords: spec.keywords,
      ...(spec.catalog === undefined ? {} : {catalog: spec.catalog}),
    },
  })
}

const getDef = designTool({
  verb: 'get',
  summary:
    'Returns the design to build from a Figma frame link: every node of the frame with its id, box, paint, text, auto layout, the groups its layout implies and how it reflows at narrower widths, plus the rules the page must follow. The first call registers the frame as the design of the page; later calls return the stored design.',
  running: 'Reading the design',
  done: 'Read the design',
  input: GetInputSchema,
  output: GetResultSchema,
  keywords: ['design', 'figma', 'frame', 'nodes', 'build'],
})

const checkDef = designTool({
  verb: 'check',
  summary:
    'Measures the page now against the design, node by node through the elements that render each node, and returns what to fix with the verdict: a row per box that is pinned, sized or placed unlike the design, the reflow checks at the widths the design and the page media queries name, which nodes are rendered, missing or rendered twice, and done, not yet with the reasons, stalled when the large differences stopped falling, or unsettled when the page did not render or rendered under half the nodes of the last settled round; from the second unsettled check in a row the reply also carries the coverage and the rows of what did render. A page that measures as it did last time returns that same round with unchanged: true; change what the rows name to get a new round.',
  running: 'Checking the page against the design',
  done: 'Checked the page against the design',
  input: z.object({nodes: z.array(z.string()).optional().describe('list the rows of these design nodes only')}),
  output: CheckResultSchema,
  keywords: ['design', 'measure', 'rows', 'reflow', 'verdict'],
})

const statusDef = designTool({
  verb: 'status',
  summary:
    'Says where the page stands without measuring it: the verdict, counts, coverage and rows of the last design_check, or that there is none yet.',
  running: 'Reading the design status',
  done: 'Read the design status',
  input: z.object({}),
  output: StatusSchema,
  keywords: ['design', 'status', 'verdict'],
})

const measureDef = designTool({
  verb: 'measure',
  summary: 'measure the page at a width: components, pixels and how they were taken',
  running: 'Measuring the page',
  done: 'Measured the page',
  input: MeasureInputSchema,
  output: MeasureResultSchema,
  keywords: ['design', 'measure'],
  catalog: false,
})

export const DESIGN_TOOLS = [getDef, checkDef, statusDef, measureDef] as const

type Rgb = [number, number, number]
type MeasureSource = z.output<typeof MeasureSourceSchema>
type CapturePath = z.output<typeof CapturePathSchema>
type GetInput = z.output<typeof GetInputSchema>

export type Box = z.output<typeof BoxSchema>
export type Design = z.infer<typeof DesignSchema>
export type DesignNode = z.infer<typeof DesignNodeSchema>
export type Match = z.infer<typeof MatchSchema>
export type TargetRecord = z.infer<typeof TargetRecordSchema>
export type LiveComponent = z.output<typeof LiveComponentSchema>
export type Mapping = z.output<typeof MappingSchema>
export type IdTree = z.output<typeof IdTreeSchema>
export type IdNode = z.output<typeof IdNodeSchema>
export type Round = z.output<typeof RoundSchema>
export type GateRow = z.output<typeof GateRowSchema>
export type Reflow = z.output<typeof ReflowSchema>
export type Coverage = z.output<typeof CoverageSchema>
export type Counts = z.output<typeof CountsSchema>
export type Status = z.output<typeof StatusSchema>
export type Got = z.output<typeof GetResultSchema>
export type RoundReply = z.output<typeof MeasuredSchema> | z.output<typeof UnsettledSchema>
export type Checked = z.output<typeof CheckResultSchema>
export type Ballot = {node: string; candidate: string; path: string; won: boolean} & Record<Layer, number>
type Layer = 'dom' | 'src' | 'cssom' | 'total'
export type Raster = {
  width: number
  height: number
  crop(input: {box: Box; margin?: number}): Raster
  scaled(scale: number): Raster
  rgb(index: number): Rgb
  fills(input: {box: Box; glyphs: Box[]; color: string}): string[]
  median(exclude: Box[]): Rgb
  png(): Uint8Array
  pixels(): Uint8Array
  trim(box: Box): Box
  edges(): Uint8Array
  blur(radius: number): Raster
  compare(input: {other: Raster; comparator: string}): {mismatch: number; mask: Uint8Array}
  paintDiff(input: {mask: Uint8Array; width: number}): Raster
}

export type TargetAdapter = {
  kind: string
  accepts(ref: string): boolean
  load(input: {
    ref: string
    scale: number
    project: Storage
    files: Storage
    attachments: {document?: unknown; image?: Uint8Array}
  }): Promise<{design: Design; image: Uint8Array; warnings: string[]}>
  dispose?(): Promise<void>
}

export type Measurer = {
  probe(page: ServerToolPageAccess): Promise<{route: string; framework: 'react' | 'solid'}>
  measure(input: {page: ServerToolPageAccess} & z.output<typeof MeasureInputSchema>): Promise<Measured>
  dispose(): void
}

export type Measured = Pick<
  z.output<typeof MeasureResultSchema>,
  'route' | 'width' | 'overflowX' | 'queries' | 'sheets' | 'longestTask' | 'pageError' | 'masks'
> & {live: LiveComponent; raster: Raster; path: CapturePath; sources: MeasureSource[]; framework: 'react' | 'solid'}

export type Pairer = (input: {
  design: Design
  measured: Measured
  target: Raster
  ids: IdNode
  pins: {node: string; path: string; margin: number}[]
  budget: number
}) => Promise<{root: Match; partial: boolean; votes: Ballot[]}>

export type Runner = (input: {record: TargetRecord; page: ServerToolPageAccess}) => Promise<RoundReply>

export type Differ = {
  get(input: {input: GetInput; session: string; page: ServerToolPageAccess}): Promise<Got>
  check(input: {nodes: string[] | undefined; session: string}): Promise<Checked>
  status(input: {session: string}): Promise<Status>
  dispose(): void
}

export type DesignRuntime = {
  cwd: string
  state: Storage
  project: Storage
  files: Storage
  store: Store
  adapters: TargetAdapter[]
  measurer: Measurer
  pairer: Pairer
  comparator: string
}
