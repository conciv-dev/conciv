import type {JSX} from 'solid-js'
import type {MessagePart, ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {GroupingOptions} from './grouping.js'

export type PageSessionThinkingPart = Extract<MessagePart, {type: 'thinking'}>

export type PageSessionRenderProps = {
  parts: ReadonlyArray<ToolCallPart>
  thinking: ReadonlyArray<PageSessionThinkingPart>
  resultFor: (toolCallId: string) => ToolResultPart | undefined
  streaming: boolean
}

export type PageSessionRenderer = (props: PageSessionRenderProps) => JSX.Element

export type PageSessionConfig = {
  render: PageSessionRenderer
  actNames: ReadonlySet<string>
  toolPrefix: string
}

export function pageSessionGroupingOptions(config: PageSessionConfig | undefined): GroupingOptions | undefined {
  if (!config) return undefined
  return {pageActNames: config.actNames, pageToolPrefix: config.toolPrefix}
}

export function pageSessionCallParts(
  parts: ReadonlyArray<MessagePart>,
  indices: ReadonlyArray<number>,
): ToolCallPart[] {
  return indices.flatMap((index) => {
    const part = parts[index]
    return part?.type === 'tool-call' ? [part] : []
  })
}

export function pageSessionThinkingParts(
  parts: ReadonlyArray<MessagePart>,
  indices: ReadonlyArray<number>,
): PageSessionThinkingPart[] {
  return indices.flatMap((index) => {
    const part = parts[index]
    return part?.type === 'thinking' && part.content.trim().length > 0 ? [part] : []
  })
}

export function pageSessionHasSteps(
  parts: ReadonlyArray<MessagePart>,
  indices: ReadonlyArray<number>,
  actNames: ReadonlySet<string>,
): boolean {
  return indices.some((index) => {
    const part = parts[index]
    return part?.type === 'tool-call' && actNames.has(part.name)
  })
}
