import type {ToolCardEntry, ToolUIComponent} from '@mandarax/protocol/tool-view-types'

// Our analogue of assistant-ui's defineToolkit: map tool name → its card, get back the self-describing
// ToolCardEntry[] the Thread/Message dispatch matches by name (Pi/TanStack model — no name→component
// registry object passed around). `execute` is server-side here, so a toolkit entry is just the card.
type ToolkitEntry = ToolUIComponent | {render: ToolUIComponent; streamTitle?: string}

export function defineToolkit(map: Record<string, ToolkitEntry>): ToolCardEntry[] {
  return Object.entries(map).map(([name, entry]) =>
    typeof entry === 'function'
      ? {names: [name], render: entry}
      : {names: [name], render: entry.render, streamTitle: entry.streamTitle},
  )
}
