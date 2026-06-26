import type {z} from 'zod'
import type {ExtensionTool, ToolRenderer, ToolRequest} from './types.js'

export type ToolBuilder<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown> = ExtensionTool & {
  inputSchema: Schema
  __ctx?: Ctx
  server: (
    execute: (input: z.infer<Schema>, ctx: Ctx, request: ToolRequest) => Promise<unknown> | unknown,
  ) => ToolBuilder<Schema, Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Schema, Ctx>
}

export function defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(definition: {
  name: string
  description: string
  inputSchema: Schema
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
}): ToolBuilder<Schema, Ctx> {
  const builder: ToolBuilder<Schema, Ctx> = {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    streamTitle: definition.streamTitle,
    server(execute) {
      builder.__execute = async (raw, ctx, request) =>
        execute(definition.inputSchema.parse(raw), ctx as Ctx, request as ToolRequest)
      return builder
    },
    render(renderer) {
      builder.__render = renderer
      return builder
    },
  }
  return builder
}
