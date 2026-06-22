import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import {loadResolver} from '../anchor/load-resolver.js'

// The AI's mouse-free counterpart to the human element pick: name a component (or JSX tag) in a file
// and get back a source target {file, line, column} to pass to comment.create. Project-root-confined
// via the resolver; returns {found:false} when the file escapes the root or the name isn't present.
export function createElementTools(cwd: string): ToolDefinition[] {
  const reference = defineTool({
    name: 'element.reference',
    label: 'Reference element by source',
    description: 'Locate a React component (or JSX tag) by name in a file to target it without a pick.',
    parameters: z.object({file: z.string(), component: z.string()}),
    promptSnippet: 'Use element.reference to target a component by name (file + component) for comment.create.',
    execute: async (input) => {
      const resolver = await loadResolver(cwd)
      const target = await resolver.locate(input.file, input.component)
      return target ? {found: true, ...target} : {found: false}
    },
  })
  return [reference]
}
