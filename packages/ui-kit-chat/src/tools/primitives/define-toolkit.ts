import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolCardEntry, ToolCardView} from '@conciv/protocol/tool-view-types'

type ToolkitEntry = ToolCardView & {streamTitle?: string; display?: 'standalone'}

export function defineToolkit(map: Record<string, ToolkitEntry>): ToolCardEntry[] {
  return Object.entries(map).map(([name, entry]) => ({
    names: [name],
    render: entry.render,
    hasEmbeddedBody: entry.hasEmbeddedBody,
    streamTitle: entry.streamTitle,
    display: entry.display,
  }))
}

export function findToolEntry(
  entries: readonly ToolCardEntry[] | undefined,
  part: ToolCallPart,
  result: ToolResultPart | undefined,
): ToolCardEntry | undefined {
  return entries?.find((entry) => entry.names.includes(part.name) && (entry.accepts?.(part, result) ?? true))
}
