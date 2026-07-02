import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

export type ToolStatus = 'running' | 'complete' | 'error' | 'approval'

export function toolStatus(part: ToolCallPart, result: ToolResultPart | undefined): ToolStatus {
  if (part.state === 'approval-requested') return 'approval'
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete' || part.state === 'complete' || part.output !== undefined) return 'complete'
  return 'running'
}
