import type {Component} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@conciv/types/chat-message-types'
import type {ToolCardProps, ToolViewCtx} from '@conciv/types/tool-view-types'

export type ToolUIComponent = Component<ToolCardProps>

export type ToolBodyPredicate = (part: ToolCallPart, result: ToolResultPart | undefined, ctx: ToolViewCtx) => boolean

export type ToolCardView = {
  render: ToolUIComponent
  hasEmbeddedBody: ToolBodyPredicate
}

export type ToolCardEntry = ToolCardView & {
  names: string[]
  display?: 'standalone'
}

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
