import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

export const elementReferenceDef = toolDefinition({
  name: 'element_reference',
  description: 'Locate a React component (or JSX tag) by name in a file to target it without a pick.',
  inputSchema: z.object({file: z.string(), component: z.string()}),
  outputSchema: z
    .object({
      found: z.boolean(),
      file: z.string().optional(),
      line: z.number().optional(),
      column: z.number().optional(),
    })
    .loose(),
  meta: {
    summary: 'locate a component by name in a file',
    category: 'whiteboard',
    mutating: false,
    keywords: ['element', 'component', 'locate'],
    hint: 'answers found false when the component is not in the file',
  },
  promptSnippet: 'Use element_reference to target a component by name (file + component) for comment_create.',
})
