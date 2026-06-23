import type {ExtensionBuilder} from './define-extension.js'
import type {ExtensionServerContributions, ExtensionServerTool, ExtensionTool} from './types.js'

function toServerTool(tool: ExtensionTool): ExtensionServerTool | null {
  if (!tool.serverExecute) return null
  return {name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: tool.serverExecute}
}

export function collectServerContributions(builders: ExtensionBuilder<object>[]): ExtensionServerContributions {
  const seen = new Set<string>()
  const tools: ExtensionServerTool[] = []
  const prompts: string[] = []
  for (const builder of builders) {
    const contributed = builder.serverFactory?.()
    const declaredTools = [...(builder.tools ?? []), ...(contributed?.tools ?? [])]
    for (const tool of declaredTools) {
      if (seen.has(tool.name)) continue
      const serverTool = toServerTool(tool)
      if (!serverTool) continue
      seen.add(tool.name)
      tools.push(serverTool)
    }
    for (const tool of builder.tools ?? []) if (tool.promptSnippet) prompts.push(tool.promptSnippet)
    if (builder.systemPrompt) prompts.push(builder.systemPrompt)
    if (contributed?.systemPrompt) prompts.push(contributed.systemPrompt)
  }
  return {tools, systemPrompt: prompts.join('\n\n')}
}
