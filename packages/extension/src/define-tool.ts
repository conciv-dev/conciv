import type {z} from 'zod'
import type {ExtensionTool, ToolRenderer} from './types.js'

export type ToolBuilder<Schema extends z.ZodObject<z.ZodRawShape>> = ExtensionTool & {
  inputSchema: Schema
  server: (execute: (input: z.infer<Schema>) => Promise<unknown> | unknown) => ToolBuilder<Schema>
  render: (renderer: ToolRenderer) => ToolBuilder<Schema>
}

export function defineTool<Schema extends z.ZodObject<z.ZodRawShape>>(definition: {
  name: string
  description: string
  inputSchema: Schema
  promptSnippet?: string
  promptGuidelines?: string[]
}): ToolBuilder<Schema> {
  const builder: ToolBuilder<Schema> = {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    server(execute) {
      builder.serverExecute = async (raw: unknown) => execute(definition.inputSchema.parse(raw))
      return builder
    },
    render(renderer) {
      builder.clientRender = renderer
      return builder
    },
  }
  return builder
}
