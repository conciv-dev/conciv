import type {ToolCardEntry, ToolUIComponent} from '@conciv/protocol/tool-view-types'

type ToolkitEntry = ToolUIComponent | {render: ToolUIComponent; streamTitle?: string; display?: 'standalone'}

export function defineToolkit(map: Record<string, ToolkitEntry>): ToolCardEntry[] {
  return Object.entries(map).map(([name, entry]) =>
    typeof entry === 'function'
      ? {names: [name], render: entry}
      : {names: [name], render: entry.render, streamTitle: entry.streamTitle, display: entry.display},
  )
}
