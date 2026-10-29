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
