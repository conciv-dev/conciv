import {z} from 'zod'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'
import {defineTool, type ToolBuilder, type ToolErrors} from '@conciv/extension/tool'
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
  'fill',
  'align',
  'padding',
  'fontSize',
  'lineHeight',
  'fontWeight',
  'background',
  'foreground',
  'radius',
  'text',
] as const

const DeltaKindNameSchema = z.enum(DELTA_KIND_NAMES)

export type DeltaKindName = z.infer<typeof DeltaKindNameSchema>

export const BoxSchema = z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})

export const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})

export const LiveStylesSchema = z.object({
  background: z.string(),
  color: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  fontWeight: z.number(),
  radius: z.number(),
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
  styles: LiveStylesSchema,
  index: z.number().describe('position among the DOM siblings, 1-based'),
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
  breakpoint: z.boolean().optional(),
  warning: z
    .enum(['sample-data'])
    .optional()
    .describe('the live text is a literal equal to sample data in the design; render it from the data instead'),
})

const UnmatchedSchema = z.object({
  kind: z.enum(['missing', 'extra']),
  target: BoxSchema.optional(),
  live: BoxSchema.optional(),
  source: SourceLocSchema.optional(),
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

export const ViewportResultSchema = z.object({width: z.number(), height: z.number()})

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
  height: Width.optional().describe('viewport height in px'),
  probe: z.boolean().optional().describe('only report the live viewport size'),
  clear: z.boolean().optional().describe('remove the hidden capture frame'),
  timeout: z.number().int().positive().optional().describe('how long the page may take to answer, in ms'),
})

export const WinnerInputSchema = z.object({
  selector: z.string().describe('CSS selector of the element'),
  properties: z.array(z.string()).describe('CSS properties to explain'),
  width: Width.optional().describe(
    'viewport width the element was captured at; a capture frame of this width and height is read instead of the tab',
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
  'frame-blocked': {
    message:
      'the app did not render inside the capture frame (frame-ancestors or X-Frame-Options); capture through cdp or chromium is not available yet',
  },
  'frame-timeout': {message: 'the capture frame did not settle in time'},
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

const CAPTURE_SPEC = {
  verb: 'capture',
  summary: 'capture the live page at the tab width as a PNG with its component tree',
  mutating: false,
  icon: 'read',
  running: 'Capturing the page',
  done: 'Captured the page',
  output: z.union([CaptureResultSchema, ViewportResultSchema]),
  hint: 'returns the path of the PNG, never the bytes',
  keywords: ['design', 'capture', 'screenshot', 'components'],
} as const

export const captureDef = designTool({...CAPTURE_SPEC, input: CaptureInputSchema})

const TabCaptureInputSchema = CaptureInputSchema.extend({
  width: Width.optional().describe('viewport width of the hidden capture frame; defaults to the tab width'),
})

export const tabCaptureDef = designTool({...CAPTURE_SPEC, input: TabCaptureInputSchema})

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
  summary: 'remove design targets and the hidden capture frame',
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
export type TabCaptureInput = z.output<typeof TabCaptureInputSchema>
export type WinnerInput = z.output<typeof WinnerInputSchema>
export type ClearInput = z.output<typeof ClearInputSchema>
export type TargetResult = z.infer<typeof TargetResultSchema>
export type ComponentReport = z.infer<typeof ComponentReportSchema>
export type StatusReport = z.infer<typeof StatusReportSchema>
export type CaptureResult = Omit<z.infer<typeof CaptureResultSchema>, 'components'> & {components: LiveComponent[]}
export type ViewportResult = z.infer<typeof ViewportResultSchema>
export type WinnerResult = z.infer<typeof WinnerResultSchema>
export type ClearResult = z.infer<typeof ClearResultSchema>
