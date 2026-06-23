import type {ExtensionBuilder} from './define-extension.js'
import type {ExtensionServerContributions, ExtensionServerTool, ExtensionTool} from './types.js'

function toServerTool(tool: ExtensionTool): ExtensionServerTool | null {
  if (!tool.__execute) return null
  return {name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: tool.__execute}
}

export function collectServerContributions(builders: ExtensionBuilder<object>[]): ExtensionServerContributions {
  const seen = new Set<string>()
  const tools: ExtensionServerTool[] = []
  const prompts: string[] = []
  for (const builder of builders) {
    const contributed = builder.__server?.()
    const declaredTools = [...(builder.tools ?? []), ...(contributed?.tools ?? [])]
    for (const tool of declaredTools) {
      const serverTool = toServerTool(tool)
      if (!serverTool) continue
      if (seen.has(tool.name)) throw new Error(`extension tool name collision: "${tool.name}" is defined twice`)
      seen.add(tool.name)
      tools.push(serverTool)
    }
    for (const tool of builder.tools ?? []) if (tool.promptSnippet) prompts.push(tool.promptSnippet)
    if (builder.systemPrompt) prompts.push(builder.systemPrompt)
    if (contributed?.systemPrompt) prompts.push(contributed.systemPrompt)
  }
  return {tools, systemPrompt: prompts}
}
