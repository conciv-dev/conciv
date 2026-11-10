import {z} from 'zod'
import {CatalogSchemas} from './catalog-defs.js'
import {designTool} from './design-tool.js'

const SUMMARY =
  'Lists the components of this project to build the page from, ranked: the kit first in full, then the app own components, then a count of the rest; each with its import line, file, sentence, the props that matter, a usage and how often it is imported and rendered on the page behind link. show gives one component with every prop and the design nodes it rendered; prefer, doNotUse and clear mark a component by name. Build from these before writing a new component.'

const Named = z.string().min(1).optional()

export const componentsDef = designTool({
  name: 'design_components',
  summary: SUMMARY,
  running: 'Listing the project components',
  done: 'Listed the project components',
  input: z.object({
    link: z.string().min(1).optional().describe('the Figma frame link of the page, for what it renders now'),
    show: Named.describe('the component name to show in full'),
    prefer: Named.describe('a component name to rank first'),
    doNotUse: Named.describe('a component name to leave out of the list'),
    clear: Named.describe('a component name to unmark'),
  }),
  output: z.object({
    text: z.string(),
    preview: z
      .string()
      .optional()
      .describe('with show: the dev-server path that renders the component alone, or error: and its first line'),
    components: z.array(CatalogSchemas.Ranked).optional(),
    component: CatalogSchemas.Component.extend({nodes: z.array(CatalogSchemas.NodeRef)}).optional(),
  }),
  keywords: ['design', 'components', 'kit', 'catalog'],
  positional: 'show',
})
