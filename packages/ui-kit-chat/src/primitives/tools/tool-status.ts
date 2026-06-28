import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// The one place tool status is derived from a tanstack tool-call part + its paired result. Shared by
// every tool card (ToolFallback / ApplyPatch / Bash / …) so the rule lives once, not per-card.
export type ToolStatus = 'running' | 'complete' | 'error' | 'approval'

export function toolStatus(part: ToolCallPart, result: ToolResultPart | undefined): ToolStatus {
  if (part.state === 'approval-requested') return 'approval'
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete' || part.state === 'complete' || part.output !== undefined) return 'complete'
  return 'running'
}
