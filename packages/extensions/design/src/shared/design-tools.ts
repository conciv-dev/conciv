import {z} from 'zod'
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
import {designTool} from './design-tool.js'
import {componentsDef} from './components-def.js'

const getDef = designTool({
  name: `${DESIGN_TOOL_PREFIX}get`,
  summary:
    'Returns the design to build from a Figma frame link for the page at route, the path of the page you are building (design_check measures that route; without route it measures the page the tab showed at this call): every node of the frame with its id, box, paint, text, auto layout, the groups its layout implies and how it reflows at narrower widths, plus the rules the page must follow. The first call registers the frame as the design of the page; later calls return the stored design. With several links, one frame per width, each frame is registered and the reply holds one design per frame in variants.',
  running: 'Reading the design',
  done: 'Read the design',
  input: GetInputSchema,
  output: GetReplySchema,
  keywords: ['design', 'figma', 'frame', 'nodes', 'build'],
})

const checkDef = designTool({
  name: `${DESIGN_TOOL_PREFIX}check`,
  summary:
    'Measures the page now against the design, node by node through the elements that render each node, and returns what to fix with the verdict: a row per box that is pinned, sized or placed unlike the design, the reflow checks at the widths the design and the page media queries name, which nodes are rendered, missing or rendered twice, and done, not yet with the reasons, stalled when neither the large differences nor the rows fell for two rounds, unsettled when the page did not render or rendered under half the nodes of the last settled round, or broken when the page does not compile or throws while rendering: the reply names the file, line and error (compile for a compile error, thrown for an error the page throws), has no rows, and nothing else was measured until that error is fixed; from the second unsettled check in a row the reply also carries the coverage and the rows of what did render. A page that measures as it did last time returns that same round with unchanged: true; change what the rows name to get a new round. With several frames each is measured at its width against its own nodes and the reply holds one result per frame in variants; done is every variant done.',
  running: 'Checking the page against the design',
  done: 'Checked the page against the design',
  input: z.object({nodes: z.array(z.string()).optional().describe('list the rows of these design nodes only')}),
  output: CheckResultSchema,
  keywords: ['design', 'measure', 'rows', 'reflow', 'verdict'],
})

const statusDef = designTool({
  name: `${DESIGN_TOOL_PREFIX}status`,
  summary:
    'Says where the page stands without measuring it: the verdict, counts, coverage and rows of the last design_check, or that there is none yet; with several frames, one per variant.',
  running: 'Reading the design status',
  done: 'Read the design status',
  input: z.object({}),
  output: StatusReplySchema,
  keywords: ['design', 'status', 'verdict'],
})

const measureDef = designTool({
  name: `${DESIGN_TOOL_PREFIX}measure`,
  summary: 'measure the page at a width: components, pixels and how they were taken',
  running: 'Measuring the page',
  done: 'Measured the page',
  input: MeasureInputSchema,
  output: MeasureResultSchema,
  keywords: ['design', 'measure'],
  catalog: false,
})

const shotsDef = designTool({
  name: `${DESIGN_TOOL_PREFIX}shots`,
  summary:
    'capture elements alone at a width, from the mirror when the width is not the tab width, each beside a reference',
  running: 'Capturing elements',
  done: 'Captured elements',
  input: ShotsInputSchema,
  output: ShotsResultSchema,
  keywords: ['design', 'image'],
  catalog: false,
})

export const DESIGN_TOOLS = [getDef, checkDef, statusDef, measureDef, shotsDef, componentsDef] as const
