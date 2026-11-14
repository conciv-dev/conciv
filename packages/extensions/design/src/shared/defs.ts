import {z} from 'zod'
import type {Storage} from 'unstorage'
import type {HomeDb} from '@conciv/db'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PageNodeShotSchema, screenshotNodeDef} from '@conciv/extension-page/defs'
import {RawFrameSchema, type RawFrame, type SourceLoc} from '@conciv/protocol/page-types'
import type {Store} from './store.js'
import type {createSessionRuns} from '../server/runs/session-runs.js'
import {ProgressSchema} from './progress.js'
import {LiveStylesSchema} from './live-styles.js'
import {CatalogSchemas, type Component, type TokenSource} from './catalog-defs.js'
import type {readIds} from './id-tree.js'
import {MAGNITUDES} from './magnitudes.js'

const ROLES = ['placeholder', 'data', 'unknown'] as const
const PLACEHOLDER_KINDS = ['icon', 'logo', 'image', 'avatar'] as const
export const DESIGN_TOOL_PREFIX = 'design_'

export const DESIGN_VERDICTS = ['right', 'wrong'] as const
const CHECK_VERDICTS = ['done', 'not yet', 'stalled', 'unsettled', 'broken'] as const

export const WIDGETS = ['hidden', 'shown'] as const

const WidgetSchema = z
  .enum(WIDGETS)
  .describe('hidden leaves the conciv widget and overlay out of every measurement; shown measures them as page')

export const BROKEN_BY = ['compile', 'runtime'] as const

export const ROUND_STATES = ['measured', 'unsettled', 'unchanged', 'broken', 'refused'] as const

export const ARTIFACT_KINDS = [
  'dom',
  'cssom',
  'fom',
  'screenshot',
  'diff',
  'mask',
  'figma',
  'design',
  'frame',
  'source_diff',
] as const

const MeasureSourceSchema = z.enum(['dom', 'mirror', 'takumi'])
const CapturePathSchema = z.enum(['region', 'snapdom-live', 'snapdom-mirror', 'cdp'])
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

const GlyphSchema = z.object({text: z.string(), boxes: z.array(BoxSchema)})

const OpinionSchema = z.object({box: BoxSchema, confidence: z.number()})

const LiveComponentFieldsSchema = z.object({
  source: SourceLocSchema.nullable(),
  site: z
    .string()
    .optional()
    .describe('file:line of the component call that rendered it, from data-conciv-site, when it has no source'),
  key: z.string().nullable().describe('the data-conciv-key the compiler served, null without one'),
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
  component: z
    .string()
    .optional()
    .describe('the main component name of an INSTANCE or COMPONENT, its variant part dropped'),
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
  widget: WidgetSchema.default('hidden'),
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
  src: z.object({
    at: SourceLocSchema.nullable(),
    site: z.string().optional().describe('file:line of the component call that rendered the site'),
    element: z.string(),
    classes: z.array(z.string()),
    parent: Id,
  }),
  fom: z.array(FomSchema),
  get children(): z.ZodArray<typeof IdNodeSchema> {
    return z.array(IdNodeSchema)
  },
})

export const IdTreeSchema = z.object({root: IdNodeSchema, revoted: z.array(z.string()), gone: z.array(z.string())})

const DomSiteSchema = z.object({
  id: z.string(),
  dom: IdNodeSchema.shape.dom,
  src: IdNodeSchema.shape.src,
  get children(): z.ZodArray<typeof DomSiteSchema> {
    return z.array(DomSiteSchema)
  },
})

const CssomSiteSchema = z.object({
  id: z.string(),
  cssom: IdNodeSchema.shape.cssom,
  get children(): z.ZodArray<typeof CssomSiteSchema> {
    return z.array(CssomSiteSchema)
  },
})

export const DomSnapshotSchema = IdTreeSchema.pick({revoted: true, gone: true}).extend({root: DomSiteSchema})

export const CssomSnapshotSchema = z.object({queries: z.array(z.number()), root: CssomSiteSchema})

const MagnitudeSchema = z.enum(MAGNITUDES)

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
  token: z.string().nullable().optional().describe('the design token a paint row field is bound to'),
  component: z
    .string()
    .optional()
    .describe(
      'on a token-drift row, the component that renders the element; on a component row, the one the design names',
    ),
  specifier: z.string().optional().describe('on a component row, the import path of the component the design names'),
  kitToken: z.string().optional().describe('on a token-drift row, the kit token the page value is'),
  designToken: z.string().optional().describe('on a token-drift row, the design variable the field is bound to'),
  property: z.string().optional().describe('the property the row compares'),
  expected: z.string().optional().describe('the value the design wants, with its unit'),
  actual: z.string().optional().describe('the value the page shows, with its unit'),
  delta: z.number().nullable().optional().describe('actual less expected when both are numbers'),
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

const CountsSchema = z.object({
  ...COUNTED,
  reflow: Count.default(0),
  paint: Count.optional(),
  drift: Count.optional().describe('token-drift rows: flags, never counted in rows'),
})

const PixelsSchema = z.object({share: z.number().describe('share of mismatched pixels against the design image')})

export const RoundSchema = z.object({
  round: z.number(),
  rows: z.array(GateRowSchema),
  reflow: ReflowsSchema,
  coverage: CoverageSchema,
  counts: CountsSchema,
  pixels: PixelsSchema.nullable(),
  progress: ProgressSchema.nullable().default(null),
  at: z.number(),
  tree: z.string().default('').describe('sha256 of the measured keys, boxes and styles and the page stylesheets'),
  verdict: z.enum(CHECK_VERDICTS).nullable().default(null),
  unsettled: z.string().nullable().default(null).describe('why the round was measured but not judged'),
  broken: z
    .string()
    .nullable()
    .default(null)
    .describe('the error of a page that does not compile or throws, file:line:column: message; nothing was measured'),
  brokenBy: z
    .enum(BROKEN_BY)
    .nullable()
    .default(null)
    .describe('compile for a transform error, runtime for an error the page throws while rendering'),
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
    hint: CatalogSchemas.Hint.optional().describe('the project component this node probably is'),
  })
  .loose()

const LinksSchema = z.union([z.url(), z.array(z.url()).min(1)])

const PathsSchema = z.union([z.string().meta({format: 'path'}), z.array(z.string().meta({format: 'path'}))])

export const GetInputSchema = z
  .object({
    figma: LinksSchema.optional().describe('the Figma frame link, with its node-id; a list, one link per width'),
    document: z
      .unknown()
      .optional()
      .describe('the frame REST nodes document when the engine has no key; a list for several'),
    image: PathsSchema.optional().describe('path of the design PNG, or the PNG as base64; a list for several'),
    widget: WidgetSchema.optional().describe('hidden by default; shown when the widget itself is the design'),
    route: z
      .string()
      .optional()
      .describe(
        'the path of the page the design is for, such as /pricing; the tab route when design_get is called by default',
      ),
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
  components: z.string().optional().describe('the project components to build from, as design_components lists them'),
})

export const GetReplySchema = z.union([GetResultSchema, z.object({variants: z.array(GetResultSchema)})])

const UnsettledSchema = z.object({
  unsettled: z.literal(true),
  rendered: z.number(),
  route: z.string().describe('the route the check measured'),
  error: z.string().optional(),
})

const CompileErrorSchema = z.object({
  message: z.string().describe('the first line of the error'),
  file: z.string().nullable().describe('the file that does not compile, relative to the project'),
  line: z.number().nullable(),
  column: z.number().nullable(),
})

const BrokenSchema = z.object({
  round: z.number(),
  verdict: z.literal('broken'),
  reasons: z.array(z.string()),
  compile: CompileErrorSchema.describe('the error the dev server reports for the page'),
})

const ThrownSchema = z.object({
  round: z.number(),
  verdict: z.literal('broken'),
  reasons: z.array(z.string()),
  thrown: CompileErrorSchema.describe('the error the page throws while rendering, at the first frame in its own files'),
})

const MeasuredSchema = RoundSchema.pick({
  round: true,
  rows: true,
  reflow: true,
  coverage: true,
  counts: true,
  progress: true,
}).extend({
  unchanged: z.literal(true).optional().describe('the page measured as the last round did; this is that round'),
  fontsLoading: z.number().optional().describe('ms a measure of this check waited for fonts that were still loading'),
  progress: ProgressSchema.nullable().optional(),
  ...UnsettledSchema.partial().shape,
})

const JUDGED = {verdict: z.enum(CHECK_VERDICTS), reasons: z.array(z.string())}

const VARIANT = {target: z.string(), width: z.number()}

const CheckedOneSchema = z.union([
  MeasuredSchema.extend(JUDGED),
  UnsettledSchema.extend({verdict: z.literal('unsettled'), reasons: z.array(z.string())}),
  BrokenSchema,
  ThrownSchema,
])

export const CheckResultSchema = z.union([
  CheckedOneSchema,
  z.object({...JUDGED, variants: z.array(z.intersection(CheckedOneSchema, z.object(VARIANT)))}),
])

const StatusSchema = MeasuredSchema.pick({round: true, rows: true, progress: true}).extend({
  ...JUDGED,
  widget: WidgetSchema.optional(),
  counts: CountsSchema.nullable(),
  coverage: CoverageSchema.nullable(),
})

export const StatusReplySchema = z.union([
  StatusSchema,
  z.object({...JUDGED, variants: z.array(StatusSchema.extend(VARIANT))}),
])

export const MeasureResultSchema = z.object({
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
  scrollHeight: z.number().default(0).describe('the scroll height of the body of the measured document'),
  queries: z.array(z.number()).default([]).describe('the widths the media and container queries of the page name'),
  sheets: z.string().default('').describe('sha256 of the page stylesheets'),
  framework: z.enum(['react', 'solid']).nullable().default(null).describe('react with a fiber, solid with vite ids'),
  scheme: CatalogSchemas.Scheme.default('light').describe('the prefers-color-scheme of the page when it was measured'),
  longestTask: z.number().optional(),
  pageError: z.string().optional().describe('the first line of the dev server error overlay covering the page'),
  fontsLoading: z
    .number()
    .optional()
    .describe('ms the measure waited for stylesheets and fonts that were still loading when it went ahead'),
  thrown: z
    .object({
      message: z.string(),
      frames: z.array(RawFrameSchema.required({fileName: true, line: true, column: true})),
      ago: z.number().describe('ms between the error and the reply'),
    })
    .optional()
    .describe('the last uncaught error or unhandled rejection the page raised while the widget ran'),
})

const Width = z.number().int().positive()

export const MeasureInputSchema = z.object({
  width: Width.optional().describe(
    'the width to measure at, in the mirror: the tab route loaded in a frame the tool owns',
  ),
  fresh: z.boolean().default(false).describe('load the page into the mirror again before measuring'),
  height: Width.optional().describe('the height to capture'),
  widget: WidgetSchema.default('hidden'),
  timeout: z.number().int().positive().optional(),
})

export const RouteInputSchema = z.object({route: z.string().describe('the path to open the tab at')})

export const RouteResultSchema = z.object({initiated: z.literal(true)})

export const ShotsInputSchema = z.object({
  width: Width,
  height: Width,
  nodes: z.array(screenshotNodeDef.inputSchema),
  timeout: z.number().int().positive().optional(),
})

export const ShotsResultSchema = z.object({
  shots: z.array(z.object({shot: PageNodeShotSchema.nullable(), error: z.string().nullable()})),
})

type Rgb = [number, number, number]
type MeasureSource = z.output<typeof MeasureSourceSchema>
type CapturePath = z.output<typeof CapturePathSchema>
type GetInput = z.output<typeof GetInputSchema>

export type Box = z.output<typeof BoxSchema>
export type Design = z.infer<typeof DesignSchema>
export type DesignNode = z.infer<typeof DesignNodeSchema>
export type Match = z.infer<typeof MatchSchema>
export type TargetRecord = z.infer<typeof TargetRecordSchema>
export type Widget = z.output<typeof WidgetSchema>
export type LiveComponent = z.output<typeof LiveComponentSchema>
export type Mapping = z.output<typeof MappingSchema>
export type IdTree = z.output<typeof IdTreeSchema>
export type DomSite = z.output<typeof DomSiteSchema>
export type CssomSite = z.output<typeof CssomSiteSchema>
export type IdNode = z.output<typeof IdNodeSchema>
export type Round = z.output<typeof RoundSchema>
export type GateRow = z.output<typeof GateRowSchema>
export type Reflow = z.output<typeof ReflowSchema>
export type Coverage = z.output<typeof CoverageSchema>
export type Counts = z.output<typeof CountsSchema>
export type Status = z.output<typeof StatusSchema>
export type Got = z.output<typeof GetResultSchema>
export type RoundReply = z.output<typeof MeasuredSchema> | z.output<typeof UnsettledSchema> | {thrown: CompileError}
export type Checked = z.output<typeof CheckResultSchema>
export type CompileError = z.output<typeof CompileErrorSchema>
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
  }): Promise<{design: Design; image: Uint8Array; warnings: string[]; raw?: unknown}>
  dispose?(): Promise<void>
}

export type Measurer = {
  probe(page: ServerToolPageAccess): Promise<{route: string; framework: 'react' | 'solid'}>
  measure(input: {page: ServerToolPageAccess} & z.output<typeof MeasureInputSchema>): Promise<Measured>
  dispose(): void
}

export type Measured = Pick<
  z.output<typeof MeasureResultSchema>,
  | 'route'
  | 'width'
  | 'overflowX'
  | 'scrollHeight'
  | 'queries'
  | 'sheets'
  | 'longestTask'
  | 'pageError'
  | 'masks'
  | 'scheme'
  | 'fontsLoading'
> & {
  live: LiveComponent
  raster: Raster
  path: CapturePath
  sources: MeasureSource[]
  framework: 'react' | 'solid'
  thrown?: {message: string; frames: RawFrame[]; at: number}
}

export type Pairer = (input: {
  design: Design
  measured: Measured
  target: Raster
  ids: IdNode
  pins: {node: string; path: string; margin: number}[]
  budget: number
}) => Promise<{root: Match; partial: boolean; votes: Ballot[]}>

export type Runner = (input: {
  record: TargetRecord
  page: ServerToolPageAccess
  edits: {quiet: () => Promise<void>; updated: () => number}
  variants?: number[]
  wider?: {id: string; width: number}
}) => Promise<RoundReply>

export type Differ = {
  get(input: {input: GetInput; session: string; page: ServerToolPageAccess}): Promise<z.output<typeof GetReplySchema>>
  check(input: {nodes: string[] | undefined; session: string}): Promise<Checked>
  status(input: {session: string}): Promise<z.output<typeof StatusReplySchema>>
  dispose(): void
}

export type DesignRuntime = {
  cwd: string
  home: HomeDb
  state: Storage
  project: Storage
  files: Storage
  store: Store
  runs: ReturnType<typeof createSessionRuns>
  adapters: TargetAdapter[]
  measurer: Measurer
  pairer: Pairer
  comparator: string
  tokens: TokenSource[]
  components: ComponentRows
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
}

export type ComponentRows = {
  catalogKey(): Promise<string>
  rows(input: {
    design: Design
    reads: Pick<ReturnType<typeof readIds>, 'mapped' | 'named' | 'getSRC' | 'sites'>
    relation: Map<string, Component>
    earlier: Map<string, Component>[]
  }): Promise<GateRow[]>
}
