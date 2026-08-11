import type {JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

export type PageSessionRenderProps = {
  parts: ReadonlyArray<ToolCallPart>
  resultFor: (toolCallId: string) => ToolResultPart | undefined
  streaming: boolean
}

export type PageSessionRenderer = (props: PageSessionRenderProps) => JSX.Element

export type PageSessionConfig = {
  render: PageSessionRenderer
  actNames: ReadonlySet<string>
  toolPrefix: string
}
