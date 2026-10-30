import {z} from 'zod'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'
import {defineTool, type ToolBuilder, type ToolErrors} from '@conciv/extension/tool'
import type {LiveComponent} from './types.js'

export const DESIGN_EXTENSION_NAME = 'design'

export const DESIGN_TOOL_PREFIX = 'design_'

export function designVerbOfTool(name: string): string {
  if (!name.startsWith(DESIGN_TOOL_PREFIX)) throw new Error(`"${name}" is not a design tool`)
  return name.slice(DESIGN_TOOL_PREFIX.length)
}

export const DELTA_KIND_NAMES = [
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
] as const

export const DeltaKindNameSchema = z.enum(DELTA_KIND_NAMES)

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

export const LiveComponentSchema = z.object({
  source: SourceLocSchema.nullable(),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema,
  textBox: BoxSchema.nullable(),
  axis: z.enum(['row', 'column']).nullable(),
  styles: LiveStylesSchema,
  children: z.array(z.record(z.string(), z.unknown())).describe('nested components of the same shape'),
})

export const ProvenanceSchema = z.object({
  via: z.enum(['sx', 'style', 'className', 'css', 'emotion', 'styled', 'library', 'unknown']),
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  declaration: z.string().optional(),
  selector: z.string().optional(),
  suggest: z.string().optional(),
})

export const DeltaSchema = ProvenanceSchema.partial().extend({
  kind: DeltaKindNameSchema,
  side: z.enum(['left', 'right', 'top', 'bottom', 'x', 'y']).optional(),
  live: z.union([z.number(), z.string()]),
  target: z.union([z.number(), z.string()]),
  breakpoint: z.boolean().optional(),
})

export const UnmatchedSchema = z.object({
  kind: z.enum(['missing', 'extra']),
  target: BoxSchema.optional(),
  live: BoxSchema.optional(),
  source: SourceLocSchema.optional(),
})

export const WinnerSchema = z.object({
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

export const TargetResultSchema = z.object({
  id: z.string(),
  route: z.string(),
  width: z.number(),
  height: z.number(),
  scale: z.number(),
})

export const ComponentReportSchema = z.object({
  source: SourceLocSchema.nullable(),
  tag: z.string(),
  selector: z.string(),
  live: BoxSchema,
  target: BoxSchema.nullable(),
  mismatch: z.number(),
  deltas: z.array(DeltaSchema),
  children: z.number(),
})

export const DiffReportSchema = z.object({
  target: z.object({id: z.string(), route: z.string(), width: z.number()}),
  mismatch: z.number(),
  diffImage: z.string(),
  livePath: z.string(),
  components: z.array(ComponentReportSchema),
  unmatched: z.array(UnmatchedSchema),
  hint: z.string().optional(),
})

export type DiffReport = z.infer<typeof DiffReportSchema>

export const StatusReportSchema = z.object({
  route: z.string(),
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
})

export const CaptureResultSchema = z.object({
  path: z.string(),
  width: z.number(),
  height: z.number(),
  route: z.string(),
  components: z.array(LiveComponentSchema),
})

export const ViewportResultSchema = z.object({width: z.number(), height: z.number()})

export const WinnerResultSchema = z.record(z.string(), WinnerSchema.nullable())

export const ClearResultSchema = z.object({removed: z.number()})

const Width = z.number().int().positive()

export const TargetInputSchema = z.object({
  image: z.string().describe('path of a PNG under the project, or the PNG as base64'),
  route: z.string().optional().describe('route the image is the design of; defaults to the live route'),
  width: Width.optional().describe('viewport width in px; defaults to the live tab width'),
  name: z.string().optional().describe('a name for the target'),
})

export const DiffInputSchema = z.object({
  target: z.string().optional().describe('target id; defaults to the target of the live route at the width'),
  width: Width.optional().describe('viewport width in px; defaults to the live tab width'),
  depth: z.number().int().min(1).max(6).default(3).describe('how deep to descend into the component tree'),
  limit: z.number().int().min(1).max(50).default(12).describe('how many components to report'),
})

export const StatusInputSchema = z.object({route: z.string().optional().describe('route; defaults to the live route')})

export const CaptureInputSchema = z.object({
  width: Width.optional().describe('viewport width in px; defaults to the live tab width'),
  height: Width.optional().describe('viewport height in px'),
  probe: z.boolean().optional().describe('only report the live viewport size'),
  clear: z.boolean().optional().describe('remove the hidden capture frame'),
})

export const WinnerInputSchema = z.object({
  selector: z.string().describe('CSS selector of the element'),
  properties: z.array(z.string()).describe('CSS properties to explain'),
})

export const ClearInputSchema = z.object({
  target: z.string().optional().describe('target id to remove'),
  route: z.string().optional().describe('remove every target of this route'),
})

export const DESIGN_ERRORS = {
  'not-implemented': {message: 'this design verb is not implemented yet'},
  'image-unreadable': {message: 'image is neither a PNG file nor PNG base64'},
  'width-required': {message: 'pass a width: the live tab width could not be read'},
  'no-target': {message: 'no design target for this route and width; register one with design_target'},
  'frame-unsupported': {message: 'capturing at a width other than the tab width is not supported yet'},
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
      icon: spec.icon,
      label: {running: spec.running, done: spec.done},
      hint: spec.hint,
      mutating: spec.mutating,
      mirrors: false,
      capture: 'none',
      keywords: spec.keywords,
    },
  })
}

export const targetDef = designTool({
  verb: 'target',
  summary: 'register a design image as the target of a route at a width',
  mutating: true,
  icon: 'edit',
  running: 'Registering the design target',
  done: 'Registered the design target',
  input: TargetInputSchema,
  output: TargetResultSchema,
  hint: 'replaces an earlier target of the same route and width; then edit and run design_diff',
  keywords: ['design', 'mockup', 'image', 'figma', 'png'],
})

export const diffDef = designTool({
  verb: 'diff',
  summary: 'compare the live page with its design target and rank the components that differ',
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
  summary: 'report whether every registered width of a route matches its design',
  mutating: false,
  icon: 'read',
  running: 'Reading the design status',
  done: 'Read the design status',
  input: StatusInputSchema,
  output: StatusReportSchema,
  hint: 'done is true once every width has a diff with nothing above tolerance',
  keywords: ['design', 'done', 'progress'],
})

export const captureDef = designTool({
  verb: 'capture',
  summary: 'capture the live page at a width as a PNG with its component tree',
  mutating: false,
  icon: 'read',
  running: 'Capturing the page',
  done: 'Captured the page',
  input: CaptureInputSchema,
  output: z.union([CaptureResultSchema, ViewportResultSchema]),
  hint: 'returns the path of the PNG, never the bytes',
  keywords: ['design', 'capture', 'screenshot', 'components'],
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
  summary: 'remove design targets and the hidden capture frame',
  mutating: true,
  icon: 'edit',
  running: 'Clearing design targets',
  done: 'Cleared design targets',
  input: ClearInputSchema,
  output: ClearResultSchema,
  hint: 'removes one target by id or every target of a route',
  keywords: ['design', 'remove', 'reset'],
})

export const DESIGN_TOOL_DEFS = [targetDef, diffDef, statusDef, captureDef, winnerDef, clearDef] as const

export type TargetInput = z.output<typeof TargetInputSchema>
export type DiffInput = z.output<typeof DiffInputSchema>
export type StatusInput = z.output<typeof StatusInputSchema>
export type CaptureInput = z.output<typeof CaptureInputSchema>
export type WinnerInput = z.output<typeof WinnerInputSchema>
export type ClearInput = z.output<typeof ClearInputSchema>
export type TargetResult = z.infer<typeof TargetResultSchema>
export type ComponentReport = z.infer<typeof ComponentReportSchema>
export type StatusReport = z.infer<typeof StatusReportSchema>
export type CaptureResult = Omit<z.infer<typeof CaptureResultSchema>, 'components'> & {components: LiveComponent[]}
export type ViewportResult = z.infer<typeof ViewportResultSchema>
export type WinnerResult = z.infer<typeof WinnerResultSchema>
export type ClearResult = z.infer<typeof ClearResultSchema>
