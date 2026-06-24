import type {z} from 'zod'
import type {ExtensionTool, ToolRenderer} from './types.js'

export type ToolBuilder<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown> = ExtensionTool & {
  inputSchema: Schema
  __ctx?: Ctx
  server: (execute: (input: z.infer<Schema>, ctx: Ctx) => Promise<unknown> | unknown) => ToolBuilder<Schema, Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Schema, Ctx>
}

export function defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(definition: {
  name: string
  description: string
  inputSchema: Schema
  promptSnippet?: string
  promptGuidelines?: string[]
}): ToolBuilder<Schema, Ctx> {
  const builder: ToolBuilder<Schema, Ctx> = {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    server(execute) {
      builder.__execute = async (raw, ctx) => execute(definition.inputSchema.parse(raw), ctx as Ctx)
      return builder
    },
    render(renderer) {
      builder.__render = renderer
      return builder
    },
  }
  return builder
}
