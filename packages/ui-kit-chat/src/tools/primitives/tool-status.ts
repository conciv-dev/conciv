import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'

export type ToolStatus = 'running' | 'complete' | 'error' | 'approval' | NonNullable<ToolResultPart['outcome']>

export function toolStatus(part: ToolCallPart, result: ToolResultPart | undefined): ToolStatus {
  if (part.state === 'approval-requested') return 'approval'
  if (result?.outcome !== undefined) return result.outcome
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete' || part.state === 'complete' || part.output !== undefined) return 'complete'
  return 'running'
}
