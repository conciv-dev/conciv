import {DESIGN_TOOL_PREFIX, RouteInputSchema, RouteResultSchema} from './defs.js'
import {designTool} from './design-tool.js'

export const routeDef = designTool({
  name: `${DESIGN_TOOL_PREFIX}route`,
  summary: 'open the tab at the route of the design before it is measured',
  running: 'Opening the route of the design',
  done: 'Opened the route of the design',
  input: RouteInputSchema,
  output: RouteResultSchema,
  keywords: ['design', 'route'],
  catalog: false,
})
