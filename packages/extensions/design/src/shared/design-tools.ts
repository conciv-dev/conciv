import {z} from 'zod'
import type {ToolBuilder} from '@conciv/extension'
import {defineTool} from '@conciv/extension/tool'
import {DESIGN_ERRORS} from './errors.js'
import {
  CheckResultSchema,
  DESIGN_TOOL_PREFIX,
  GetInputSchema,
  GetReplySchema,
  MeasureInputSchema,
  MeasureResultSchema,
  ShotsInputSchema,
  ShotsResultSchema,
  StatusReplySchema,
} from './defs.js'

const DESIGN_EXTENSION_NAME = 'design'

const getDef = designTool({
  verb: 'get',
  summary:
    'Returns the design to build from a Figma frame link: every node of the frame with its id, box, paint, text, auto layout, the groups its layout implies and how it reflows at narrower widths, plus the rules the page must follow. The first call registers the frame as the design of the page; later calls return the stored design. With several links, one frame per width, each frame is registered and the reply holds one design per frame in variants.',
  running: 'Reading the design',
  done: 'Read the design',
  input: GetInputSchema,
  output: GetReplySchema,
  keywords: ['design', 'figma', 'frame', 'nodes', 'build'],
})

const checkDef = designTool({
  verb: 'check',
  summary:
    'Measures the page now against the design, node by node through the elements that render each node, and returns what to fix with the verdict: a row per box that is pinned, sized or placed unlike the design, the reflow checks at the widths the design and the page media queries name, which nodes are rendered, missing or rendered twice, and done, not yet with the reasons, stalled when the large differences stopped falling, unsettled when the page did not render or rendered under half the nodes of the last settled round, or broken when the page does not compile: the reply names the file, line and error, has no rows, and nothing else was measured until the compile error is fixed; from the second unsettled check in a row the reply also carries the coverage and the rows of what did render. A page that measures as it did last time returns that same round with unchanged: true; change what the rows name to get a new round. With several frames each is measured at its width against its own nodes and the reply holds one result per frame in variants; done is every variant done.',
  running: 'Checking the page against the design',
  done: 'Checked the page against the design',
  input: z.object({nodes: z.array(z.string()).optional().describe('list the rows of these design nodes only')}),
  output: CheckResultSchema,
  keywords: ['design', 'measure', 'rows', 'reflow', 'verdict'],
})

const statusDef = designTool({
  verb: 'status',
  summary:
    'Says where the page stands without measuring it: the verdict, counts, coverage and rows of the last design_check, or that there is none yet; with several frames, one per variant.',
  running: 'Reading the design status',
  done: 'Read the design status',
  input: z.object({}),
  output: StatusReplySchema,
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

const shotsDef = designTool({
  verb: 'shots',
  summary:
    'capture elements alone at a width, from the mirror when the width is not the tab width, each beside a reference',
  running: 'Capturing elements',
  done: 'Captured elements',
  input: ShotsInputSchema,
  output: ShotsResultSchema,
  keywords: ['design', 'image'],
  catalog: false,
})

export const DESIGN_TOOLS = [getDef, checkDef, statusDef, measureDef, shotsDef] as const

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
      capture: 'none',
      keywords: spec.keywords,
      ...(spec.catalog === undefined ? {} : {catalog: spec.catalog}),
    },
  })
}
