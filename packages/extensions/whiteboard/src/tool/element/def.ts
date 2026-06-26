import {z} from 'zod'

export const ElementReferenceInput = z.object({file: z.string(), component: z.string()})

export const elementReferenceDef = {
  name: 'element.reference',
  description: 'Locate a React component (or JSX tag) by name in a file to target it without a pick.',
  inputSchema: ElementReferenceInput,
  promptSnippet: 'Use element.reference to target a component by name (file + component) for comment.create.',
}
