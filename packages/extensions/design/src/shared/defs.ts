import {z} from 'zod'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'
import {defineTool, type ToolBuilder, type ToolErrors} from '@conciv/extension/tool'
import {TOLERANCES} from './tolerances.js'
import type {LiveComponent} from './types.js'

export const DESIGN_EXTENSION_NAME = 'design'

export const DESIGN_TOOL_PREFIX = 'design_'

export const DESIGN_GUIDE =
  'A design target is registered. Call `design_diff` to measure the live page against it, fix the brief, run it again, and stop when `stop` is set. Do not judge a design match from a screenshot.'

export const NO_TARGET_MESSAGE = 'no design target is registered; register the design image with design_target'

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
  'background',
  'foreground',
  'radius',
  'border',
  'axis',
  'columns',
  'text',
] as const

export const STAGES = ['structure', 'content', 'geometry', 'paint'] as const

export type Stage = (typeof STAGES)[number]

export const STOPS = ['done', 'residual-only', 'oscillating', 'stalled', 'budget'] as const

export type Stop = (typeof STOPS)[number]

const DeltaKindNameSchema = z.enum(DELTA_KIND_NAMES)

const MeasureSourceSchema = z.enum(['dom', 'mirror'])

const CapturePathSchema = z.enum(['region', 'snapdom-live', 'snapdom-mirror'])

const MirrorLimitsSchema = z.object({
  canvases: z.number().describe('canvas elements, blank in the mirror and masked'),
  fonts: z.array(z.string()).describe('font families added through the FontFace API, missing in the mirror'),
  inlineWidths: z.number().describe('elements with an inline width or height, laid out as the live page left them'),
})

export type DeltaKindName = z.infer<typeof DeltaKindNameSchema>

export const BoxSchema = z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})

export const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})

export const LiveStylesSchema = z.object({
  background: z.string(),
  color: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  fontWeight: z.number(),
  fontFamily: z.string(),
  radius: z.number(),
  border: z
    .object({
      width: z.number(),
      style: z.string(),
      color: z.string(),
      side: z.enum(['top', 'right', 'bottom', 'left']),
    })
    .describe('the widest painted border side, the top one when none is painted'),
})

export const GlyphSchema = z.object({text: z.string(), boxes: z.array(BoxSchema)})

const LiveComponentSchema = z.object({
  source: SourceLocSchema.nullable(),
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

const DeltaSchema = ProvenanceSchema.partial().extend({
  kind: DeltaKindNameSchema,
  side: z.enum(['left', 'right', 'top', 'bottom', 'x', 'y']).optional(),
  live: z.union([z.number(), z.string()]),
  target: z.union([z.number(), z.string()]),
  source: MeasureSourceSchema.optional().describe('dom when read in the tab, mirror when read in the mirror'),
  confidence: z.number().optional(),
  width: z.number().optional().describe('the design width the delta was measured at'),
  warning: z
    .enum(['sample-data'])
    .optional()
    .describe('the live text is a literal equal to sample data in the design; render it from the data instead'),
})

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
})

const RouteItemSchema = z
  .object({live: z.string(), target: z.string()})
  .describe('the tab shows another route than the design target; nothing was measured')

export const DiffReportSchema = z.object({
  target: z.object({id: z.string(), route: z.string().optional(), width: z.number()}),
  mismatch: z.number(),
  diffImage: z.string(),
  livePath: z.string(),
  xray: z.string(),
  components: z.array(ComponentReportSchema),
  unmatched: z.array(UnmatchedSchema),
  hint: z.string().optional(),
  route: RouteItemSchema.optional(),
  warnings: z.array(DeltaSchema).default([]).describe('outside every count; hard-coded sample data to replace'),
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
  budgetLeft: z.number().default(TOLERANCES.roundBudget),
  stop: z.enum(STOPS).nullable().default(null).describe('why the loop ends; null while it goes on'),
  score: z
    .array(z.number())
    .default([])
    .describe('unpaired share, structure, content, geometry, paint, residual share; lower is better'),
  responsive: z.array(ResponsiveSchema).default([]).describe('how this design relates to the other designs'),
  partial: z.boolean().default(false).describe('the run hit its time budget before every node was paired'),
  pinsLost: z.array(z.string()).default([]).describe('pin decisions whose node or element is gone'),
})

export type DiffReport = z.infer<typeof DiffReportSchema>

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
  round: z.number().optional(),
  stop: z.enum(STOPS).nullable().optional(),
  acceptedRun: z.string().optional(),
  next: z.string().optional(),
  reregister: z.boolean().optional().describe('the stored target is unreadable; register the design image again'),
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

export const TargetInputSchema = z.object({
  image: z.string().meta({format: 'path'}).describe('path of a PNG under the project, or the PNG as base64'),
  scale: z.number().positive().optional().describe('image pixels per CSS pixel: 2 for a retina export, 1 by default'),
  route: z.string().optional().describe('a label for the route the image is the design of; defaults to the live route'),
  name: z.string().optional().describe('a name for the target'),
})

export const DiffInputSchema = z.object({
  depth: z.number().int().min(1).max(6).default(3).describe('how deep to descend into the component tree'),
  limit: z.number().int().min(1).max(50).default(12).describe('how many components to report'),
})

export const StatusInputSchema = z.object({})

export const CaptureInputSchema = z.object({
  height: Width.optional().describe('height of the captured area in px; defaults to the viewport height'),
  timeout: z.number().int().positive().optional().describe('how long the page may take to answer, in ms'),
})

const MeasureInputSchema = z.object({
  width: Width.optional().describe('the design width; the mirror is read when it differs from the tab width'),
  height: Width.optional().describe('the design height'),
  timeout: z.number().int().positive().optional(),
})

const RenderInputSchema = z.object({renders: z.array(RenderSchema)})

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
  summary: 'register a design image as the target; its width and height come from the image',
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
  output: DiffReportSchema,
  hint: 'fix the first components (sorted by impact) using their source and deltas, then diff again',
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
