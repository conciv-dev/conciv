import type {ToolCallPart} from '@conciv/protocol/chat-message-types'
import type {ToolCardEntry, ToolCardView} from '@conciv/protocol/tool-view-types'

type ToolkitEntry = ToolCardView & {display?: 'standalone'}

export function defineToolkit(map: Record<string, ToolkitEntry>): ToolCardEntry[] {
  return Object.entries(map).map(([name, entry]) => ({
    names: [name],
    render: entry.render,
    hasEmbeddedBody: entry.hasEmbeddedBody,
    display: entry.display,
  }))
}

export function findToolEntry(
  entries: readonly ToolCardEntry[] | undefined,
  part: ToolCallPart,
): ToolCardEntry | undefined {
  return entries?.find((entry) => entry.names.includes(part.name))
}
