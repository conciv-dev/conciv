import type {ExtensionBuilder} from './define-extension.js'
import type {ToolRenderer} from './types.js'

export function collectToolRenderers(builders: ExtensionBuilder<object>[]): {names: string[]; render: ToolRenderer}[] {
  const seen = new Set<string>()
  const entries: {names: string[]; render: ToolRenderer}[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      if (!tool.clientRender || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({names: [tool.name], render: tool.clientRender})
    }
  return entries
}
