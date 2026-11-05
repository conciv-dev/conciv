import {z} from 'zod'
import type {Storage} from 'unstorage'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'
import type {ServerApi} from '@conciv/extension'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {DesignConfig} from './tolerances.js'
import {defineTool, type ToolBuilder, type ToolErrors} from '@conciv/extension/tool'

const ROLES = ['placeholder', 'data', 'unknown'] as const
export type Role = (typeof ROLES)[number]
export const PLACEHOLDER_KINDS = ['icon', 'logo', 'image', 'avatar'] as const

export const DESIGN_EXTENSION_NAME = 'design'

const DESIGN_TOOL_PREFIX = 'design_'

export const DESIGN_GUIDE =
  "A design target is registered. Call `design_diff` to measure the live page against it, fix the brief, run it again, and stop when `stop` is set. Do not judge a design match from a screenshot. The brief names rows, columns, gaps and sizing rules; build with flow, flex and grid, never from coordinates. Never draw icons, logos or illustrations: no inline <svg> paths, no data urls, no CSS shapes copied from the image; every image and icon slot takes the Placeholder. Gradients are CSS. `data-conciv-key` attributes are written into the source by the compiler and are each element's identity for the diff: leave them in place, keep an element's key on it when you move or wrap it, and never copy one onto a second element."

export const NO_TARGET_MESSAGE = 'no design target is registered; register the design image with design_target'
export const MARK_KINDS = ['excluded', 'image-slot', 'accept-delta', 'tolerance', 'accept-node'] as const
export const UNANSWERED_HINT = 'the page tab is hidden; bring it to the foreground and run design_diff again'

export function designVerb(name: string): string {
  if (!name.startsWith(DESIGN_TOOL_PREFIX)) throw new Error(`"${name}" is not a design tool`)
  return name.slice(DESIGN_TOOL_PREFIX.length)
}

const DELTA_KIND_NAMES = [
  'inset-left',
  'inset-right',
  'inset-top',
  'inset-bottom',
  'gap-before',
  'gap-after',
  'align',
  'padding',
  'fontSize',
  'lineHeight',
  'fontWeight',
  'font',
  'background',
  'foreground',
  'radius',
  'border',
  'axis',
  'columns',
  'sizing',
  'width',
  'height',
  'lines',
  'text',
  'pixels',
] as const

export const STAGES = ['structure', 'content', 'geometry', 'paint'] as const

export type Stage = (typeof STAGES)[number]

const NODE_STATUSES = ['unbuilt', 'paired', 'done', 'regressed', 'accepted'] as const

export type NodeStatus = (typeof NODE_STATUSES)[number]

export const STOPS = ['done', 'residual-only', 'oscillating', 'stalled', 'budget'] as const

const DeltaKindNameSchema = z.enum(DELTA_KIND_NAMES)

const MeasureSourceSchema = z.enum(['dom', 'mirror', 'takumi'])

const CapturePathSchema = z.enum(['region', 'snapdom-live', 'snapdom-mirror'])

const MirrorLimitsSchema = z.object({
  canvases: z.number().describe('canvas elements, blank in the mirror and masked'),
  fonts: z.array(z.string()).describe('font families added through the FontFace API, missing in the mirror'),
  inlineWidths: z.number().describe('elements with an inline width or height, laid out as the live page left them'),
})

export type DeltaKindName = z.infer<typeof DeltaKindNameSchema>

export const BoxSchema = z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})

export const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})

const DirectionSchema = z.enum(['row', 'column', 'grid', 'stack'])

const SizeSchema = z.enum(['fill', 'fit', 'fixed'])

const GapSchema = z
  .object({px: z.number(), uniform: z.boolean()})
  .describe('the median distance between consecutive children; uniform when every gap is within tolerance of it')

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

export type ContainerLayout = z.infer<typeof ContainerLayoutSchema>
export type NodeLayout = z.infer<typeof NodeLayoutSchema>

const SizingSchema = z.enum(['fixed', 'auto'])

export const LiveStylesSchema = z.object({
  background: z.string(),
  color: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  fontWeight: z.number(),
  fontFamily: z.string(),
  textAlign: z.string().describe('the computed text-align'),
  radius: z.number(),
  position: z.string(),
  sizing: z
    .object({width: SizingSchema, height: SizingSchema})
    .describe('fixed when the element own rule or inline style sets the property to a px length'),
  border: z
    .object({
      width: z.number(),
      style: z.string(),
      color: z.string(),
      side: z.enum(['top', 'right', 'bottom', 'left']),
    })
    .describe('the widest painted border side, the top one when none is painted'),
  gradient: z
    .object({from: z.string(), to: z.string()})
    .nullable()
    .default(null)
    .describe('the first and last stop of the first linear-gradient in background-image, null when there is none'),
})

export const GlyphSchema = z.object({text: z.string(), boxes: z.array(BoxSchema)})

export type Glyph = z.output<typeof GlyphSchema>

export const OpinionSchema = z
  .object({box: BoxSchema, confidence: z.number()})
  .describe('the box takumi lays the component out at, beside the mirror box; never scored')

const LiveComponentSchema = z.object({
  source: SourceLocSchema.nullable(),
  key: z
    .string()
    .nullable()
    .describe(
      "the data-conciv-key the compiler wrote into the source, the element's identity for the diff; null without one",
    ),
  instance: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'the call-site keys and React keys of the fiber chain from the root, which tell copies of one key apart; null when the framework is unknown',
    ),
  owner: z.string().nullable().describe('the component owner path from the root, null when the framework is unknown'),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema,
  textBox: BoxSchema.nullable(),
  glyphs: z
    .array(GlyphSchema)
    .describe('the text nodes the component paints, each with one box per line, grown by the anti-aliasing halo'),
  axis: z.enum(['row', 'column']).nullable(),
  columns: z.number().nullable().describe('track count of grid-template-columns, null when not a grid'),
  styles: LiveStylesSchema,
  role: z.string().nullable().describe('the role attribute'),
  hints: z.array(z.string()).describe('class names and the aria-label, tokens for pairing'),
  index: z.number().describe('position among the DOM siblings, 1-based'),
  path: z.string().describe('sibling positions from the root joined by /, with s entering a shadow root'),
  opinion: OpinionSchema.optional(),
  drawn: z
    .boolean()
    .default(false)
    .describe('an svg with path, polygon or circle children, an img with a data: src, or a canvas'),
  placeholder: z
    .enum(PLACEHOLDER_KINDS)
    .nullable()
    .default(null)
    .describe('the kind of the Placeholder whose root this is, null for any other element'),
  children: z.array(z.record(z.string(), z.unknown())).describe('nested components of the same shape'),
})

const ProvenanceSchema = z.object({
  via: z.enum(['sx', 'style', 'className', 'css', 'emotion', 'styled', 'library', 'source', 'unknown']),
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  declaration: z.string().optional(),
  selector: z.string().optional(),
  suggest: z.string().optional(),
})

export type Provenance = z.output<typeof ProvenanceSchema>

const DeltaSchema = ProvenanceSchema.partial().extend({
  kind: DeltaKindNameSchema,
  side: z.enum(['left', 'right', 'top', 'bottom', 'x', 'y']).optional(),
  live: z.union([z.number(), z.string()]),
  target: z.union([z.number(), z.string()]),
  source: MeasureSourceSchema.optional().describe('dom when read in the tab, mirror when read in the mirror'),
  confidence: z.number().optional(),
  width: z.number().optional().describe('the design width the delta was measured at'),
  lineHeight: z.number().optional().describe('the design line height a lines delta is sized by'),
  box: BoxSchema.optional().describe('the live box of the element a warning is about'),
  opinion: z
    .object({source: z.literal('takumi'), live: z.union([z.number(), z.string()]), confidence: z.number()})
    .optional()
    .describe('the same value read from the takumi layout; shown, never scored'),
  warning: z
    .enum(['sample-data', 'typography-skipped', 'svg-drawn', 'page-error'])
    .optional()
    .describe(
      'sample-data: the live text is a literal equal to sample data in the design; render it from the data instead. typography-skipped: live is the number of text samples the page did not render, so their type was not estimated. svg-drawn: a picture the page draws where the design has an image or icon slot; replace it with the Placeholder. page-error: live is the error the dev server shows instead of the page; the run counted nothing',
    ),
})

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

export type Border = z.infer<typeof BorderSchema>

const PaintSchema = z.object({
  background: z.string(),
  gradient: z.object({from: z.string(), to: z.string(), axis: z.enum(['vertical', 'horizontal'])}).optional(),
})

export type Paint = z.infer<typeof PaintSchema>

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
  layout: NodeLayoutSchema.partial().optional(),
})

const DesignNodeSchema = DesignNodeBaseSchema.extend({
  get children() {
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
  live: LiveComponentSchema.omit({children: true}).nullable().describe('null when the node is unbuilt'),
  confidence: z.number(),
  source: MeasureSourceSchema,
  deltas: z.array(DeltaSchema).describe('empty when the node is clean'),
  status: z.enum(NODE_STATUSES),
  since: z.string().describe('the run that reached the status'),
  get children(): z.ZodArray<typeof MatchSchema> {
    return z.array(MatchSchema)
  },
})

export const RunSchema = z.object({
  id: z.string(),
  round: z.number(),
  design: z.string().describe('the id of the design the run measured'),
  root: MatchSchema,
  extras: z.array(LiveComponentSchema).describe('live elements no design node claimed'),
  score: z.array(z.number()),
  stop: z.enum(STOPS).nullable(),
  images: z.object({live: z.string(), diff: z.string()}),
})

const AttachmentsSchema = z.object({
  document: z.unknown().optional(),
  image: z.instanceof(Uint8Array).optional(),
})

const DECISION_KINDS = [
  'pin',
  'excluded',
  'image-slot',
  'accept-delta',
  'tolerance',
  'accept-node',
  'twin',
  'typography',
] as const

export const DecisionSchema = z.object({
  id: z.string(),
  kind: z.enum(DECISION_KINDS),
  anchor: z.string(),
  value: z.union([z.string(), z.number(), TypographySchema, z.null()]),
  at: z.number(),
})

export const TargetRecordSchema = z.object({
  id: z.string(),
  session: z.string().default(''),
  route: z.string().optional(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  scale: z.number(),
  createdAt: z.number(),
  acceptedRun: z.string().optional(),
})

export type OcrLine = z.infer<typeof OcrLineSchema>
export type Typography = z.infer<typeof TypographySchema>

export type DesignNode = z.infer<typeof DesignNodeSchema>
export type Design = z.infer<typeof DesignSchema>
export type Match = z.infer<typeof MatchSchema>
export type Run = z.infer<typeof RunSchema>
export type Attachments = z.infer<typeof AttachmentsSchema>
export type Decision = z.infer<typeof DecisionSchema>
type DecisionKind = Decision['kind']
export type TargetRecord = z.infer<typeof TargetRecordSchema>

export type Pairer = (input: {
  design: Design
  live: LiveComponent
  decisions: Decision[]
  previous: Match | null
  rasters: {live: Raster; target: Raster}
  twins: {node: string; path: string}[]
  comparators: Comparators
  budget: number
}) => Promise<{root: Match; partial: boolean; carried: number}>

export type Shift = {dx: number; dy: number}

export type Offset = {match: Match | null; shift: Shift}

export type Geometry = {
  align(input: {root: Match; live: Raster; exact: boolean}): {global: Shift; offsets: Offset[]}
  fingerprint(
    component: Pick<LiveComponent, 'source' | 'key' | 'instance' | 'owner' | 'tag' | 'glyphs' | 'box'>,
  ): Fingerprint
  targetBox(input: {node: Match['node']; live: NonNullable<Match['live']>; raster: Raster; exact: boolean}): Box
  selectors(live: LiveComponent): Map<string, string>
}

export type Deltas = {
  elements(input: {
    root: Match
    live: LiveComponent
    raster: Raster
    exact: boolean
    source: MeasureSource
    mismatchAt: (box: Box) => number
  }): Element[]
  measure(input: {
    elements: Element[]
    reuse: Reuse | null
    shift: Shift
    live: Raster
    target: Raster
    page: Box
    decisions: Decision[]
    stamp: Pick<Delta, 'source' | 'confidence' | 'width'>
  }): Promise<{measured: Measured[]; measures: Map<string, Delta[]>; judged: Map<Element, TextJudgement>}>
  warnings(input: {
    elements: Element[]
    judged: Map<Element, TextJudgement>
    components: LiveComponent[]
    root: Match
  }): Promise<Delta[]>
  size(delta: Delta): number
  sourced(input: {delta: Delta; element: Element}): Delta
  sameWords(text: string): string
}

export type Provenancer = {
  attribute(input: {
    ranked: {element: Element; report: ComponentReport}[]
    page: ServerToolPageAccess
    width: number
    height: number
    sourced: Deltas['sourced']
  }): Promise<ComponentReport[]>
  liveText: LiveTextReader
  dispose(): void
}

export type Measurer = {
  connected(page: ServerToolPageAccess): Promise<void>
  route(page: ServerToolPageAccess): Promise<string>
  measure(input: {width?: number; height?: number; timeout?: number; page: ServerToolPageAccess}): Promise<{
    capture: LiveCapture
    longestTask?: number
    pageError?: string
  }>
  texts(input: {components: LiveComponent[]; runs: TextRun[]; live: Raster; target: Raster; reuse: Reuse | null}): {
    agreeing: Box[]
    masks: Map<string, Box[]>
  }
  typography(input: {
    texts: {node: MatchText; owner: LiveComponent}[]
    raster: Raster
    page: ServerToolPageAccess
  }): Promise<{estimates: Record<string, Typography>; skipped: number}>
  sources(capture: LiveCapture): MeasureSource[]
  confidence(capture: LiveCapture): number
  compare(input: {live: Raster; target: Raster; previous: TileCache | null}): {
    mismatch: number
    mask: Uint8Array
    width: number
    height: number
    tiles: TileCache
    carried: number
  }
  similarity(input: {
    live: Raster
    target: Raster
    mask: Uint8Array
    differing: Uint8Array
    width: number
    height: number
  }): ScoredTile[]
  mean(input: {tiles: ScoredTile[]; within?: Box}): number
  paintOver(input: {onto: Raster; from: Raster; boxes: Box[]}): Raster
  paintDiff(input: {live: Raster; mask: Uint8Array; width: number}): Raster
  share(input: {mask: Uint8Array; width: number; height: number; box: Box}): number
  reuse(input: {
    before: {grid: Grid; rawTiles: string[]; textMasks: Map<string, Box[]>; measures: Map<string, Delta[]>} | null
    live: Raster
    target: Raster
  }): {grid: Grid; rawTiles: string[]; reuse: Reuse | null}
}

export type Round = {
  score: number[]
  capturePath: CapturePath | undefined
  values: Map<string, number | string>
  capture: string
  report: DiffReport
  section: string | undefined
}

export type Verdict = Pick<DiffReport, 'stage' | 'brief' | 'round' | 'stop' | 'score' | 'rows'>

export type SectionBudget = {id: string; roundsUsed: number; open: boolean; spent: boolean}

export type Judging = {
  items: Item[]
  score: number[]
  capturePath: CapturePath | undefined
  capture: string
  warnings: Delta[]
  painted: DiffReport['painted']
  partial: boolean
  changed: {changes: Changes; since: number | null}
  crop: (node: string) => string
  similarity: {now: number; was: number} | null
}

export type Judge = {
  unmatched(input: {root: Match; components: LiveComponent[]; offsets: Offset[]; measured: Measured[]}): Unmatched[]
  items(input: {components: Measured[]; unmatched: Unmatched[]; root: Match}): Item[]
  score(input: {items: Item[]; unmatched: Unmatched[]; measured: Measured[]; masks: Box[]; page: Box}): number[]
  verdict(input: Judging & {priors: Round[]; round: number}): Verdict
  report(input: {measured: Measured[]; input: DiffInput; twins: Twin[]}): {
    reported: {element: Element; report: ComponentReport}[]
    listed: number
  }
  hint(input: {
    attributed: boolean
    absolute: boolean
    partial: boolean
    cut: {listed: number; shown: number; paired: number}
  }): {hint?: string}
  painted(components: LiveComponent[]): DiffReport['painted']
  budgets(input: {sections: DesignNode[]; items: Item[]; rounds: Round[]}): SectionBudget[]
  round(input: {
    items: Item[]
    score: number[]
    capturePath: CapturePath | undefined
    capture: string
    report: DiffReport
    section: string | undefined
  }): Round
  worse(input: {a: number[]; b: number[]}): boolean
  section(input: {
    report: DiffReport
    section: DesignNode
    judging: Judging | undefined
    measured: Measured[]
    rounds: Round[]
    counts: LedgerCounts
  }): DiffReport
  settle(input: {
    previous: Match | null
    root: Match
    accepted: Set<string>
    run: string
    items: Item[]
    crop: (node: string) => string
  }): {root: Match; changes: Changes}
  counts(roots: Match[]): LedgerCounts
}

export type Registrar = {
  register(input: {input: TargetInput; session: string; page: ServerToolPageAccess}): Promise<TargetResult>
  current(session: string): Promise<TargetRecord>
}

export type Twin = {node: string; target: string; path: string}

export type VoterName = 'text' | 'kind' | 'structure' | 'style' | 'geometry' | 'pixel' | 'hints' | 'twins'

export type VoteView = {
  key: string
  kind: 'text' | 'box' | 'image' | 'element'
  box: Box
  lines: Box[]
  text: string
  words: string
  alone: boolean
  klass: 'heading' | 'text' | 'control' | 'container' | 'media'
  ink: number | null
  fill: [number, number, number] | null
  tokens: string[]
  parent: VoteView | null
  rank: number
  media: boolean
}

export type VoteContext = {
  assigned: Map<string, VoteView>
  diagonal: number
  nodeRaster: Raster
  candidateRaster: Raster
  hashes: Map<string, Uint8Array>
  twins: Map<string, string>
  candidates: VoteView[]
  bestText: Map<string, number>
  spoken: Record<string, VoteView[]>
}

export type Voter = {
  name: VoterName
  base: number
  score: (input: {node: VoteView; candidate: VoteView; context: VoteContext}) => number | null
}

export type Similarity = {voters: Voter[]; text(input: {a: string; b: string}): number}

export type Ranker = (input: {items: Item[]}) => Item[]

export type TargetAdapter = {
  kind: string
  accepts(input: {ref: string; project: Storage}): boolean
  load(input: {ref: string; scale: number; project: Storage; attachments: Attachments}): Promise<Loaded>
}

type Loaded = {design: Design; image: Uint8Array; warnings: string[]}

export type Store = {
  put(input: {design: Design; image: Uint8Array; session: string; route?: string; name?: string}): Promise<TargetRecord>
  design(id: string): Promise<Design>
  targetImage(id: string): Promise<Uint8Array | null>
  liveImage(input: {id: string; run: string}): Promise<Uint8Array | null>
  record(id: string): Promise<TargetRecord | null>
  current(session: string): Promise<TargetRecord | null>
  list(route?: string): Promise<TargetRecord[]>
  remove(input: {id?: string; all?: boolean}): Promise<number>
  runs(id: string): Promise<string[]>
  latest(id: string): Promise<Run | null>
  run(input: {id: string; run: string}): Promise<Run | null>
  writeRun(input: {run: Run; live: Uint8Array; diff: Uint8Array}): Promise<Run>
  writePlaceholder(input: {id: string; framework: Framework}): Promise<void>
  decisions(id: string): Promise<Decision[]>
  decide(input: {id: string; kind: DecisionKind; anchor: string; value: Decision['value']}): Promise<Decision>
  revoke(input: {id: string; decision: string}): Promise<boolean>
  accept(input: {id: string; run: string}): Promise<TargetRecord>
  writeCapture(png: Uint8Array): Promise<string>
  path(key: string): string | null
}

export type Words = {
  outline(design: Design): string[]
  placeholder(framework: Framework): string
  line(input: {node: MatchNode; scale: number}): string
  delta(input: {element: Element; delta: Delta}): string
  unbuilt(input: {match: Match; parent: Match; root: Match; unbuilt: Record<string, Unmatched>}): string
  entry(entry: Unmatched): string
  row(input: {run: ContainerLayout['runs'][number]; owner: Match; root: Match}): string
  subject(input: {match: Match; root: Match}): string
  change(input: {changes: Changes; round: number; similarity: {now: number; was: number} | null}): string
  stalled(input: {stage: Stage; score: number[]; unchanged: Item[]}): string
  flipped(input: {items: Item[]; round: number}): string
  painted(count: number): string
  warning(delta: Delta): string
}

const UnmatchedSchema = z.object({
  kind: z
    .enum(['unbuilt', 'extra', 'offset'])
    .describe(
      'unbuilt: a design node nothing renders; extra: an element the design lacks; offset: a misplaced element',
    ),
  target: BoxSchema.optional(),
  live: BoxSchema.optional(),
  source: SourceLocSchema.optional(),
  label: z.string().optional().describe('the design text of an unbuilt text node, or its kind'),
  stage: z.enum(STAGES).nullable().optional().describe('the stage the entry counts in; null when it is informational'),
  shift: z.object({dx: z.number(), dy: z.number()}).optional().describe('how far an offset entry moved, in px'),
  node: z.string().optional().describe('the design node of an unbuilt or offset entry'),
  layout: z
    .object({
      direction: DirectionSchema,
      size: SizeSchema,
      index: z.number().optional(),
      gap: GapSchema.optional(),
      align: AlignSchema.optional(),
      wrap: z.boolean().optional(),
      padding: PaddingSchema.optional(),
    })
    .optional()
    .describe(
      'an unbuilt container: its own layout; an unbuilt child: the direction of its parent, its 1-based index there and its size',
    ),
})

const ResponsiveSchema = z.object({
  target: z.string().describe('the other design target'),
  width: z.number(),
  twins: z.number().describe('nodes of this design with a twin in the other one'),
  absent: z.array(z.string()).describe('nodes of this design the other one lacks'),
  reordered: z.array(z.string()).describe('nodes whose reading order changes between the two'),
  stretched: z.array(z.string()).describe('nodes that span the width in one design and not in the other'),
})

const WinnerSchema = z.object({
  selector: z.string().nullable(),
  declaration: z.string(),
  value: z.string(),
  important: z.boolean(),
  inline: z.boolean(),
  inherited: z.boolean(),
  sheet: z.object({
    href: z.string().nullable(),
    viteDevId: z.string().nullable(),
    emotion: z.boolean(),
    styled: z.boolean(),
    adopted: z.boolean(),
  }),
  conditions: z.array(z.string()),
  rulePath: z.string(),
})

const TargetResultSchema = z.object({
  id: z.string(),
  route: z.string().optional(),
  width: z.number(),
  height: z.number(),
  scale: z.number(),
  text: z.object({runs: z.number(), error: z.string().optional()}).optional(),
  stage: z.enum(STAGES).nullable().optional().describe('the stage of run 0, measured at registration'),
  brief: z.array(z.string()).optional().describe('what to fix first, from run 0'),
  next: z.string(),
})

const ComponentReportSchema = z.object({
  source: SourceLocSchema.nullable(),
  tag: z.string(),
  selector: z.string(),
  live: BoxSchema,
  target: BoxSchema.nullable(),
  mismatch: z.number(),
  deltas: z.array(DeltaSchema),
  children: z.number(),
  nodes: z.array(z.string()).optional().describe('the design nodes paired with this component'),
  path: z.string().optional().describe('where the component sits in the page tree'),
  twinDisagreement: z
    .object({target: z.string(), path: z.string()})
    .optional()
    .describe('the twin of the paired node in another design is paired to this other component'),
})

const RouteItemSchema = z
  .object({live: z.string(), target: z.string()})
  .describe('the tab shows another route than the design target; nothing was measured')

const PaintedSchema = z.object({
  count: z.number().describe('outermost absolutely or fixed positioned elements whose parent is not positioned'),
  total: z.number().describe('measured components'),
  sources: z.array(SourceLocSchema),
})

const CarriedSchema = z
  .object({pairs: z.number(), tiles: z.number()})
  .describe('pairs and pixel tiles reused from the run before because the edit did not touch them')

const PhaseSchema = z.number().default(0)

const LongestTaskSchema = z
  .number()
  .describe('the longest main-thread task in whole ms the page ran while the live page was measured')

export const TimingsSchema = z
  .object({
    capture: PhaseSchema,
    decode: PhaseSchema,
    measure: PhaseSchema,
    mask: PhaseSchema,
    similarity: PhaseSchema,
    regions: PhaseSchema,
    pair: PhaseSchema,
    typography: PhaseSchema,
    deltas: PhaseSchema,
    judge: PhaseSchema,
    encode: PhaseSchema,
    write: PhaseSchema,
    total: PhaseSchema,
    carried: CarriedSchema.default({pairs: 0, tiles: 0}),
    longestTask: LongestTaskSchema.optional(),
  })
  .describe('whole milliseconds spent in each phase of the run, zero for a phase the run skipped')

const CropSchema = z
  .string()
  .describe('url of a PNG with the design crop and the live crop of the node side by side, each grown by tileMargin')

const RowSchema = z.object({
  sentence: z.string(),
  stage: z.enum(STAGES),
  node: z.string().optional().describe('the design node of the item'),
  source: SourceLocSchema.optional().describe('the source location of the live element'),
  crop: CropSchema.optional(),
})

const FingerprintSchema = z.object({
  source: SourceLocSchema.nullable(),
  key: z.string().nullable().default(null),
  instance: z.string().nullable().default(null),
  owner: z.string().nullable().default(null),
  tag: z.string(),
  textHash: z.string(),
  box: BoxSchema,
})

export type Fingerprint = z.output<typeof FingerprintSchema>

const LedgerCountsSchema = z
  .object({unbuilt: z.number(), paired: z.number(), done: z.number(), regressed: z.number(), accepted: z.number()})
  .describe('design nodes per ledger status')

export type LedgerCounts = z.infer<typeof LedgerCountsSchema>

const ChangeSchema = z.object({node: z.string(), sentence: z.string(), crop: CropSchema})

const ChangesSchema = z
  .object({
    done: z.array(ChangeSchema).describe('nodes newly clean'),
    regressed: z.array(ChangeSchema).describe('nodes that were done and are dirty or unpaired again'),
    paired: z.array(ChangeSchema).describe('nodes paired for the first time'),
    lost: z.array(ChangeSchema).describe('nodes whose stored element is gone from the page'),
    moved: z.array(ChangeSchema).describe('nodes whose element is still there with its box elsewhere'),
  })
  .describe('what the run changed against the ledger before it')

export type Changes = z.infer<typeof ChangesSchema>

export const NO_CHANGES: Changes = {done: [], regressed: [], paired: [], lost: [], moved: []}
const NO_COUNTS: LedgerCounts = {unbuilt: 0, paired: 0, done: 0, regressed: 0, accepted: 0}
const NODE_KINDS = ['text', 'box', 'image'] as const

const SimilaritySchema = z
  .number()
  .describe(
    'mean SSIM over independent 64 px grayscale tiles, tiles wholly inside an image slot left out; 1 is identical',
  )

export const DiffReportSchema = z.object({
  target: z.object({id: z.string(), route: z.string().optional(), width: z.number()}),
  mismatch: z.number(),
  similarity: SimilaritySchema.optional(),
  sectionSimilarity: z
    .record(z.string(), z.number())
    .default({})
    .describe('the similarity of each section, keyed by section id, over the tiles centred in its box'),
  diffImage: z.string(),
  livePath: z.string(),
  xray: z.string(),
  components: z.array(ComponentReportSchema),
  unmatched: z.array(UnmatchedSchema),
  hint: z.string().optional(),
  route: RouteItemSchema.optional(),
  warnings: z
    .array(DeltaSchema)
    .default([])
    .describe('outside every count; hard-coded sample data to replace, text samples left without a type estimate'),
  painted: PaintedSchema.nullable()
    .default(null)
    .describe('the page is laid out by absolute positioning; outside every count'),
  segmentation: z
    .enum(['full', 'partial'])
    .optional()
    .describe('partial when image regions cover much of the design, so boxes inside them are not read'),
  capturePath: CapturePathSchema.optional().describe('how the pixels of this run were taken'),
  sources: z.array(MeasureSourceSchema).default([]).describe('where the boxes and styles were read'),
  limits: MirrorLimitsSchema.optional().describe('what the mirror could not reproduce'),
  stage: z.enum(STAGES).nullable().default(null).describe('the stage to fix now: the first with an item'),
  brief: z.array(z.string()).default([]).describe('what to fix this round, in order'),
  round: z.number().default(0).describe('design_diff calls since the target was registered'),
  stop: z.enum(STOPS).nullable().default(null).describe('why the loop ends; null while it goes on'),
  score: z
    .array(z.number())
    .default([])
    .describe('unpaired share, structure, content, geometry, paint, residual share; lower is better'),
  responsive: z.array(ResponsiveSchema).default([]).describe('how this design relates to the other designs'),
  partial: z
    .boolean()
    .default(false)
    .describe('pairing hit its time budget before every node was paired; the round was not counted'),
  paired: z.number().default(0).describe('design nodes paired with a live element in this run'),
  pinsLost: z.array(z.string()).default([]).describe('pin decisions whose node or element is gone'),
  timings: TimingsSchema.default(TimingsSchema.parse({})),
  rows: z
    .array(RowSchema)
    .default([])
    .describe('the first ten items of the stage, in brief order, then the next stage items the brief carries'),
  changes: ChangesSchema.default(NO_CHANGES),
  ledger: LedgerCountsSchema.default(NO_COUNTS),
  designPath: z
    .string()
    .default('')
    .describe('the design as an indented outline, one line per node; read it before building'),
  placeholderPath: z
    .string()
    .default('')
    .describe('the Placeholder component every image and icon slot takes; copy it into the page source'),
  design: z.array(z.string()).optional().describe('the lines of the design outline, with full: true'),
  truncated: z
    .object({components: z.number(), unmatched: z.number()})
    .optional()
    .describe('how many components and unmatched entries the full report cut to `limit`'),
  section: z
    .object({id: z.string(), line: z.string()})
    .optional()
    .describe('the section the report is scoped to: its id and its outline line'),
  scope: z.literal('section').optional().describe('set when the report lists one section only'),
  page: z
    .object({
      stop: z.enum(STOPS).nullable(),
      stage: z.enum(STAGES).nullable(),
      score: z.array(z.number()),
      similarity: SimilaritySchema.optional(),
    })
    .optional()
    .describe('the whole-page stop, stage and score of a section report'),
})

export type DiffReport = z.infer<typeof DiffReportSchema>

export const CompactReportSchema = DiffReportSchema.pick({
  target: true,
  round: true,
  stage: true,
  stop: true,
  score: true,
  mismatch: true,
  similarity: true,
  brief: true,
  timings: true,
  rows: true,
  xray: true,
  diffImage: true,
  livePath: true,
  capturePath: true,
  sources: true,
  partial: true,
  hint: true,
  painted: true,
  changes: true,
  designPath: true,
  placeholderPath: true,
  section: true,
  scope: true,
  page: true,
})
  .extend({
    diffImage: z.string().optional().describe('the diff image of this run; absent in a blind run'),
    livePath: z.string().optional().describe('the live capture of this run; absent in a blind run'),
    capturePath: CapturePathSchema.optional().describe('how the pixels of this run were taken; absent in a blind run'),
    counts: z
      .object({
        components: z.number(),
        paired: z.number(),
        unbuilt: z.number(),
        icons: z.number(),
        unmatched: z.number(),
        warnings: z.number(),
        done: z.number(),
        regressed: z.number(),
        drawn: z.number(),
      })
      .describe(
        'how many components the full report lists, how many nodes paired, how many are unbuilt, how many of the unbuilt are icon slots the agent may fill at will, how many unmatched entries and warnings the full report holds, how many nodes the ledger holds done and regressed, and how many pictures the page draws where the design has an image or icon slot',
      ),
  })
  .loose()
  .describe('pass `full: true` for the full report with every component and delta')

export type CompactReport = z.infer<typeof CompactReportSchema>

const StatusReportSchema = z.object({
  route: z.string().optional(),
  targets: z.array(
    z.object({
      id: z.string(),
      width: z.number(),
      mismatch: z.number().nullable(),
      above: z.number(),
      lastAt: z.number().nullable(),
    }),
  ),
  done: z.boolean(),
  score: z.array(z.number()).optional(),
  similarity: SimilaritySchema.optional(),
  round: z.number().optional(),
  stop: z.enum(STOPS).nullable().optional(),
  acceptedRun: z.string().optional(),
  next: z.string().optional(),
  reregister: z.boolean().optional().describe('the stored target is unreadable; register the design image again'),
  ledger: LedgerCountsSchema.optional(),
  changes: ChangesSchema.optional().describe('what the latest run changed'),
  designPath: z.string().optional().describe('the design as an indented outline, one line per node'),
  placeholderPath: z.string().optional().describe('the Placeholder component every image and icon slot takes'),
  sections: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(NODE_KINDS),
        line: z.string().describe('the outline line of the section without its section prefix'),
        ledger: LedgerCountsSchema,
        roundsUsed: z
          .number()
          .describe(
            'counted rounds scoped to the section whose changes touched a node of it; at the round budget it stops',
          ),
        similarity: SimilaritySchema.optional(),
      }),
    )
    .optional()
    .describe('the top-level nodes of the design in document order; pass an id to design_diff as section'),
})

const CaptureResultSchema = z.object({
  path: z.string(),
  width: z.number(),
  height: z.number(),
  route: z.string(),
  components: z.array(LiveComponentSchema),
})

export const MeasureResultSchema = z.object({
  image: z.string(),
  width: z.number(),
  height: z.number(),
  route: z.string(),
  components: z.array(LiveComponentSchema),
  capturePath: CapturePathSchema,
  source: MeasureSourceSchema,
  masks: z.array(BoxSchema),
  limits: MirrorLimitsSchema.optional(),
  opinion: z.boolean().describe('takumi laid the mirror out as a second opinion'),
  framework: z
    .enum(['react', 'solid'])
    .nullable()
    .default(null)
    .describe('react when a measured element carries a fiber, solid when the page has vite dev ids and none does'),
  longestTask: LongestTaskSchema.optional(),
  pageError: z.string().optional().describe('the first line of the dev server error overlay covering the page'),
})

const RenderSchema = z.object({
  text: z.string(),
  font: z.string(),
  size: z.number(),
  weight: z.number(),
  color: z.string(),
  background: z.string(),
})

export const RenderResultSchema = z.object({images: z.array(z.string())})

export const WinnerResultSchema = z.record(z.string(), WinnerSchema.nullable())

const ClearResultSchema = z.object({removed: z.number()})

const Width = z.number().int().positive()

export const TargetInputSchema = z
  .object({
    image: z
      .string()
      .meta({format: 'path'})
      .optional()
      .describe('path of a PNG under the project, or the PNG as base64'),
    figma: z
      .url()
      .optional()
      .describe('link of a Figma frame: https://www.figma.com/design/<fileKey>/<name>?node-id=<id>'),
    document: z
      .unknown()
      .optional()
      .describe('the frame as the Figma REST nodes document, when the engine has no FIGMA_API_KEY; pass the image too'),
    scale: z.number().positive().optional().describe('image pixels per CSS pixel: 2 for a retina export, 1 by default'),
    route: z
      .string()
      .optional()
      .describe('a label for the route the image is the design of; defaults to the live route'),
    name: z.string().optional().describe('a name for the target'),
  })
  .refine((input) => input.document !== undefined || (input.image === undefined) !== (input.figma === undefined), {
    message: 'pass image or figma, not both',
  })
  .refine((input) => input.document === undefined || (input.figma !== undefined && input.image !== undefined), {
    message: 'document goes with figma and image',
  })

export const DiffInputSchema = z.object({
  depth: z.number().int().min(1).max(6).default(3).describe('how deep to descend into the component tree'),
  limit: z.number().int().min(1).max(60).default(12).describe('how many components to report'),
  full: z.boolean().optional().describe('return the full report with every component and delta'),
  section: z
    .string()
    .optional()
    .describe('a section id from design_status.sections; the run stays whole-page, the report lists that section only'),
})

export const StatusInputSchema = z.object({})

export const WatchInputSchema = z.object({
  key: z.string().optional().describe('return the node paired to this data-conciv-key'),
  ref: z.string().optional().describe('return the node with this design id, the Figma node id for a Figma target'),
  node: z.string().optional().describe('return this node'),
  status: z.enum(NODE_STATUSES).optional().describe('return the nodes in this ledger status'),
  limit: z.number().int().positive().default(400).describe('at most this many rows'),
})

const WatchRowSchema = z.object({
  node: z.string(),
  ref: z.string().nullable().describe('the design id the node came from; the Figma node id, null for an image target'),
  kind: z.enum(NODE_KINDS),
  text: z.string().nullable().describe('the text of a text node'),
  box: BoxSchema,
  status: z.enum(NODE_STATUSES),
  key: z.string().nullable().describe('the data-conciv-key of the paired element'),
  source: SourceLocSchema.nullable(),
  path: z.string().nullable().describe('the paired element as a child-position path'),
  confidence: z.number().nullable(),
  item: z.string().nullable().describe('the worst open item of the node, as a sentence'),
})

export type WatchRow = z.infer<typeof WatchRowSchema>

export const WatchReportSchema = z.object({
  target: z.string(),
  run: z.string().nullable().describe('the run the mapping comes from; null before the first run'),
  live: z.boolean().describe('true when the mapping comes from the page watcher and is newer than the stored ledger'),
  counts: LedgerCountsSchema,
  rows: z.array(WatchRowSchema),
  truncated: z.number().describe('rows left out by limit'),
})

export type WatchReport = z.infer<typeof WatchReportSchema>
export type WatchInput = z.output<typeof WatchInputSchema>

export const CaptureInputSchema = z.object({
  height: Width.optional().describe('height of the captured area in px; defaults to the viewport height'),
  timeout: z.number().int().positive().optional().describe('how long the page may take to answer, in ms'),
})

const MeasureInputSchema = z.object({
  width: Width.optional().describe('the design width; the mirror is read when it differs from the tab width'),
  height: Width.optional().describe('the design height'),
  timeout: z.number().int().positive().optional(),
})

const RenderInputSchema = z.object({
  renders: z.array(RenderSchema),
  timeout: z.number().int().positive().optional(),
})

export const WinnerInputSchema = z.object({
  selector: z.string().describe('CSS selector of the element'),
  properties: z.array(z.string()).describe('CSS properties to explain'),
  width: Width.optional().describe(
    'design width the element was measured at; the mirror at this width is read instead of the tab',
  ),
  height: Width.optional().describe('viewport height the element was captured at'),
})

export const ClearInputSchema = z.object({
  target: z.string().optional().describe('target id to remove; defaults to the current target'),
  all: z.literal(true).optional().describe('remove every target'),
})

export const DESIGN_ERRORS = {
  'image-unreadable': {message: 'image is neither a PNG file nor PNG base64'},
  'no-target': {message: NO_TARGET_MESSAGE},
  'unknown-section': {message: 'the design has no section with that id'},
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
  mutating: boolean
  icon: ToolIconKey
  running: string
  done: string
  input: z.ZodObject<Shape>
  output: Out
  hint: string
  keywords: readonly string[]
  positional?: string
  catalog?: boolean
}): DesignToolDef<Shape, Out> {
  return defineTool({
    name: `design_${spec.verb}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: spec.output,
    errors: DESIGN_ERRORS,
    meta: {
      summary: spec.summary,
      category: DESIGN_EXTENSION_NAME,
      icon: spec.icon,
      label: {running: spec.running, done: spec.done},
      hint: spec.hint,
      mutating: spec.mutating,
      mirrors: false,
      capture: 'none',
      keywords: spec.keywords,
      ...(spec.positional === undefined ? {} : {positional: spec.positional}),
      ...(spec.catalog === undefined ? {} : {catalog: spec.catalog}),
    },
  })
}

export const targetDef = designTool({
  verb: 'target',
  summary: 'register a design image or a Figma frame as the target',
  mutating: true,
  icon: 'edit',
  running: 'Registering the design target',
  done: 'Registered the design target',
  input: TargetInputSchema,
  output: TargetResultSchema,
  hint: 'the image becomes the current target of the session; build or edit the page, then run design_diff',
  keywords: ['design', 'mockup', 'image', 'figma', 'png'],
  positional: 'image',
})

export const diffDef = designTool({
  verb: 'diff',
  summary: 'compare the live page with the current design target and rank the components that differ',
  mutating: false,
  icon: 'read',
  running: 'Comparing with the design',
  done: 'Compared with the design',
  input: DiffInputSchema,
  output: CompactReportSchema,
  hint: 'fix the brief and rows in order, then diff again',
  keywords: ['design', 'compare', 'pixels', 'deltas', 'visual'],
})

export const statusDef = designTool({
  verb: 'status',
  summary: 'report whether the live page matches the current design target',
  mutating: false,
  icon: 'read',
  running: 'Reading the design status',
  done: 'Read the design status',
  input: StatusInputSchema,
  output: StatusReportSchema,
  hint: 'done is true once the last diff of the current target has nothing above tolerance',
  keywords: ['design', 'done', 'progress'],
})

export const watchDef = designTool({
  verb: 'watch',
  summary: 'the live mapping of design nodes to the page: status, source key, source line, as the page is built',
  mutating: false,
  icon: 'read',
  running: 'Reading the design mapping',
  done: 'Read the design mapping',
  input: WatchInputSchema,
  output: WatchReportSchema,
  hint: 'look up a node by key, ref or node; without a filter the rows list every design node; runs no diff',
  keywords: ['design', 'mapping', 'pairs', 'figma', 'key'],
})

export const captureDef = designTool({
  verb: 'capture',
  summary: 'capture the live page at the tab width as a PNG with its component tree',
  mutating: false,
  icon: 'read',
  running: 'Capturing the page',
  done: 'Captured the page',
  input: CaptureInputSchema,
  output: CaptureResultSchema,
  hint: 'returns the path of the PNG, never the bytes',
  keywords: ['design', 'capture', 'screenshot', 'components'],
})

export const measureDef = designTool({
  verb: 'measure',
  summary: 'measure the page at the design width: components, pixels and how they were taken',
  mutating: false,
  icon: 'read',
  running: 'Measuring the page',
  done: 'Measured the page',
  input: MeasureInputSchema,
  output: MeasureResultSchema,
  hint: 'called by design_diff; the mirror stands in for the tab when the widths differ',
  keywords: ['design', 'measure'],
  catalog: false,
})

export const renderDef = designTool({
  verb: 'render',
  summary: 'render strings in the page fonts as PNGs for the type estimate',
  mutating: false,
  icon: 'read',
  running: 'Rendering text',
  done: 'Rendered text',
  input: RenderInputSchema,
  output: RenderResultSchema,
  hint: 'called by design_diff',
  keywords: ['design', 'typography'],
  catalog: false,
})

export const winnerDef = designTool({
  verb: 'winner',
  summary: 'name the CSS declaration that wins each property of an element',
  mutating: false,
  icon: 'read',
  running: 'Finding the winning styles',
  done: 'Found the winning styles',
  input: WinnerInputSchema,
  output: WinnerResultSchema,
  hint: 'null for a property whose computed value no declaration explains',
  keywords: ['design', 'css', 'cascade', 'specificity', 'style'],
})

export const clearDef = designTool({
  verb: 'clear',
  summary: 'remove design targets',
  mutating: true,
  icon: 'edit',
  running: 'Clearing design targets',
  done: 'Cleared design targets',
  input: ClearInputSchema,
  output: ClearResultSchema,
  hint: 'removes one target by id, the current target, or every target with all',
  keywords: ['design', 'remove', 'reset'],
})

export const DESIGN_TOOL_DEFS = [targetDef, diffDef, statusDef, captureDef, winnerDef, clearDef] as const

export type TargetInput = z.output<typeof TargetInputSchema>
export type DiffInput = z.output<typeof DiffInputSchema>
export type CaptureInput = z.output<typeof CaptureInputSchema>
export type MeasureInput = z.output<typeof MeasureInputSchema>
export type MeasureResult = Omit<z.infer<typeof MeasureResultSchema>, 'components'> & {components: LiveComponent[]}
export type RenderInput = z.output<typeof RenderInputSchema>
export type RenderResult = z.infer<typeof RenderResultSchema>
export type WinnerInput = z.output<typeof WinnerInputSchema>
export type ClearInput = z.output<typeof ClearInputSchema>
export type TargetResult = z.infer<typeof TargetResultSchema>
export type ComponentReport = z.infer<typeof ComponentReportSchema>
export type StatusReport = z.infer<typeof StatusReportSchema>
export type CaptureResult = Omit<z.infer<typeof CaptureResultSchema>, 'components'> & {components: LiveComponent[]}
export type WinnerResult = z.infer<typeof WinnerResultSchema>
export type ClearResult = z.infer<typeof ClearResultSchema>

export type LiveRole = 'literal' | 'expression' | 'mixed'

export type Box = z.output<typeof BoxSchema>
export type Raster = {width: number; height: number; data: Uint8Array}
export type SourceLoc = z.output<typeof SourceLocSchema>

export type Gradient = {from: string; to: string}

export type RoleRules = (input: {text: string; neighbours: string[]}) => {role: Role; confidence: number}

export type LiveBorder = {width: number; style: string; color: string; side: 'top' | 'right' | 'bottom' | 'left'}
export type LiveStyles = z.output<typeof LiveStylesSchema>
export type LiveComponent = Omit<z.output<typeof LiveComponentSchema>, 'children'> & {children: LiveComponent[]}
export type CapturePath = z.output<typeof CapturePathSchema>
export type MeasureSource = z.output<typeof MeasureSourceSchema>
export type MirrorLimits = z.output<typeof MirrorLimitsSchema>
export type LiveCapture = {
  raster: Raster
  viewport: {width: number; height: number}
  route: string
  components: LiveComponent[]
  capturePath: CapturePath
  source: MeasureSource
  masks: Box[]
  limits?: MirrorLimits
  opinion: boolean
  framework: Framework | null
}
export type Framework = 'react' | 'solid'

export type PixelComparator = {
  name: string
  compare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array; score?: number}
}
export type ColorMetric = {name: string; distance(input: {a: string; b: string}): number}
export type TextRun = {box: Box; text: string}

export type TextReader = {name: string; read(input: {raster: Raster}): Promise<OcrLine[]>}
type Comparators = {
  pixel: PixelComparator
  color: ColorMetric
  text: TextReader
}

export type TileRecord = {hash: string; mismatch: number; mask?: string}
export type TileCache = {
  side: number
  columns: number
  rows: number
  width: number
  height: number
  tiles: TileRecord[]
}
export type ItemKind = DeltaKindName | 'unbuilt' | 'extra' | 'offset'
export type Item = {
  key: string
  kind: ItemKind
  stage: Stage | null
  size: number
  confidence: number
  box: Box
  depth: number
  value: number | string
  sentence: string
  node?: string
  source?: SourceLoc
}
export type Flow = 'row' | 'column'
export type Side = {
  kind: DesignNode['kind']
  box: Box
  parent: Box | null
  prev: Box | null
  next: Box | null
  axis: 'row' | 'column' | null
  flow: Flow | null
  columns: number | null
  textBox: Box | null
  ink: Box | null
  lines: number | null
  edge: string | null
  radius: number | null
  padding: ContainerLayout['padding'] | null
  size: NodeLayout['size'] | null
  styles: Partial<LiveStyles>
}
export type Delta = z.output<typeof DeltaSchema>
export type DeltaKind = {
  kind: DeltaKindName
  measure(input: {live: Side; target: Side; color: ColorMetric}): Delta[]
  read?(side: Side): number | string | null
}
export type Unmatched = DiffReport['unmatched'][number]

export type MatchNode = Match['node']
export type MatchText = Extract<MatchNode, {kind: 'text'}>
export type Element = {
  match: Match
  live: LiveComponent
  node: MatchNode
  texts: MatchText[]
  source: MeasureSource
  confidence: number
  selector: string
  liveBox: Box
  targetBox: Box
  mismatch: number
  depth: number
  parent: Element | null
  host: {selector: string; live: LiveComponent} | null
  prev: Element | null
  next: Element | null
}
export type Measured = {element: Element; deltas: Delta[]}
export type Reuse = {textMasks: Map<string, Box[]>; measures: Map<string, Delta[]>; unchanged: (box: Box) => boolean}
export type LiveText = {role: LiveRole; literals: string[]}
export type LiveTextReader = (source: SourceLoc | null) => Promise<LiveText | null>
export type TextJudgement = {verdict: 'text' | 'sample-data' | null; live: string; target: string}
export type Grid = {side: number; columns: number; rows: number; width: number; height: number}
export type ScoredTile = {box: Box; similarity: number}
export type Css = {design: Design; raster: Raster; dropped: Box[]}

export type Winner = z.output<typeof WinnerSchema>
export type DesignRuntime = {
  cwd: string
  state: Storage
  project: Storage
  blind: boolean
  store: Store
  comparators: Comparators
  pairer: Pairer
  ranker: Ranker
  words: Words
  deltas: Deltas
  geometry: Geometry
  measurer: Measurer
  judge: Judge
  provenance: Provenancer
  registrar: Registrar
  xrayUrl: (input: {id: string; session: string}) => XrayLink
}

export type XrayLink = {url: string; absolute: boolean}

export type Settled = {
  grid: Grid
  rawTiles: string[]
  tiles: TileCache
  textMasks: Map<string, Box[]>
  measures: Map<string, Delta[]>
  capture: string
  observe: boolean
  run: Run
  report: DiffReport
  judging: Judging
  measured: Measured[]
  twins: Twin[]
  hinted: {attributed: boolean; absolute: boolean; partial: boolean; paired: number}
}

export type RunJob = {id: string; session: SessionId; observe: boolean; input: DiffInput}

export type Latest = {run: Run; report: DiffReport; items: Item[]}

export type Differ = {
  register(input: {input: TargetInput; session: SessionId}): Promise<TargetResult>
  run(input: {input: DiffInput; session: SessionId}): Promise<DiffReport>
  refresh(input: {session: SessionId}): Promise<void>
  touch(input: {file: string}): void
  capture(input: {id: string; session: SessionId}): Promise<DiffReport>
  accept(input: {id: string}): Promise<TargetRecord>
  status(input: {session: SessionId}): Promise<StatusReport>
  watch(input: {input: WatchInput; session: SessionId}): Promise<WatchReport>
  xray(input: {id: string}): Promise<{report: DiffReport | null; outline: string[]}>
  dispose(): void
}

export type DesignPage = ServerApi<DesignConfig>['page']
