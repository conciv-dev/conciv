import {z} from 'zod'
import {defineTool} from '@conciv/extension/tool'
import {CatalogSchemas} from './catalog-defs.js'
import {DESIGN_ERRORS} from './errors.js'

const SUMMARY =
  'Lists the components of this project to build the page from, ranked: the kit first in full, then the app own components, then a count of the rest; each with its import line, file, sentence, the props that matter, a usage and how often it is imported and rendered on the page behind link. show gives one component with every prop and the design nodes it rendered; flag marks one prefer, do-not-use or clear. Build from these before writing a new component.'

export const componentsDef = defineTool({
  name: 'design_components',
  description: SUMMARY,
  inputSchema: z.object({
    link: z.string().min(1).optional().describe('the Figma frame link of the page, for what it renders now'),
    show: z.string().min(1).optional().describe('the component name to show in full'),
    flag: z
      .object({name: z.string().min(1), flag: z.enum(['prefer', 'do-not-use', 'clear'])})
      .optional()
      .describe('mark a component: prefer ranks it first, do-not-use hides it, clear removes the mark'),
  }),
  outputSchema: z.object({
    text: z.string(),
    components: z.array(CatalogSchemas.Ranked).optional(),
    component: CatalogSchemas.Component.extend({nodes: z.array(CatalogSchemas.NodeRef)}).optional(),
  }),
  errors: {...DESIGN_ERRORS, 'no-component': {message: 'no component by that name in the catalog'}},
  meta: {
    summary: SUMMARY,
    category: 'design',
    icon: 'read',
    label: {running: 'Listing the project components', done: 'Listed the project components'},
    hint: SUMMARY,
    mutating: false,
    capture: 'none',
    positional: 'show',
    keywords: ['design', 'components', 'kit', 'catalog'],
  },
})
